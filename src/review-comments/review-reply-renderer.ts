import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import { redactSecrets } from '../utils/redaction';
import { renderSimpleTemplate } from '../utils/template';
import {
  compactBlankLines,
  formatMarkdownBulletList,
  hasUnresolvedTemplatePlaceholders,
  listUnresolvedTemplatePlaceholders,
  truncateText,
} from '../utils/text';
import { CodeflowReviewFixError } from './review-fix-errors';
import type {
  CodeflowRenderedReviewReply,
  CodeflowReviewFixItem,
} from './review-fix-payload';

const DEFAULT_REVIEW_REPLY_TEMPLATE_PATH = 'templates/review-reply.md';
const MAX_REPLY_BODY_CHARS = 4000;
const MAX_EVIDENCE_ITEM_CHARS = 500;

export interface RenderReviewReplyOptions {
  cwd?: string;
  config?: Pick<CodeflowConfig, 'reviewComments' | 'templates'>;
  templateText?: string;
  templatePath?: string | null;
  usedDefaultTemplate?: boolean;
}

export interface LoadedReviewReplyTemplate {
  text: string;
  templatePath: string | null;
  usedDefaultTemplate: boolean;
  warnings: string[];
}

export async function renderReviewReply(
  item: CodeflowReviewFixItem,
  options: RenderReviewReplyOptions = {},
): Promise<CodeflowRenderedReviewReply> {
  const config = options.config ?? getDefaultCodeflowConfig();
  const loadedTemplate = options.templateText === undefined
    ? await loadReviewReplyTemplate(config, options.cwd ?? process.cwd())
    : {
        text: options.templateText,
        templatePath: options.templatePath ?? null,
        usedDefaultTemplate: options.usedDefaultTemplate ?? false,
        warnings: [],
      };
  const replyBody = buildReplyBody(item);
  const verificationList = formatMarkdownBulletList(
    item.verification.map((value) => truncateText(value, MAX_EVIDENCE_ITEM_CHARS)),
    'No verification provided.',
  );
  const resolution = buildResolutionLine(item);
  const body = compactBlankLines(redactSecrets(renderSimpleTemplate(loadedTemplate.text, {
    threadId: item.threadId,
    classification: item.classification,
    replyBody,
    verificationList,
    resolution,
    commitSha: item.commitSha ?? '',
    fixSummary: item.fixSummary ?? '',
  })));

  assertNoUnresolvedPlaceholders(body);
  assertSafeReplyBody(body, item);

  return {
    threadId: item.threadId,
    classification: item.classification,
    body,
    templatePath: loadedTemplate.templatePath,
    usedDefaultTemplate: loadedTemplate.usedDefaultTemplate,
    warnings: loadedTemplate.warnings,
  };
}

export async function loadReviewReplyTemplate(
  config: Pick<CodeflowConfig, 'reviewComments' | 'templates'> = getDefaultCodeflowConfig(),
  cwd = process.cwd(),
): Promise<LoadedReviewReplyTemplate> {
  const configuredPath = getConfiguredReviewReplyTemplatePath(config);
  const candidates = getReviewReplyTemplateCandidates(configuredPath, cwd);

  for (const candidate of candidates) {
    const status = await statTemplateCandidate(candidate);

    if (status === 'missing') {
      continue;
    }

    if (status === 'not_file') {
      throw new CodeflowReviewFixError({
        code: 'template_unreadable',
        message: `Review reply template is not a file: ${candidate}`,
        details: { templatePath: candidate },
      });
    }

    try {
      return {
        text: await readFile(candidate, 'utf8'),
        templatePath: candidate,
        usedDefaultTemplate: false,
        warnings: [],
      };
    } catch (error) {
      throw new CodeflowReviewFixError({
        code: 'template_unreadable',
        message: `Review reply template could not be read: ${candidate}`,
        details: { templatePath: candidate },
        cause: error,
      });
    }
  }

  return loadBundledDefaultTemplate(configuredPath);
}

export function getConfiguredReviewReplyTemplatePath(
  config: Pick<CodeflowConfig, 'reviewComments' | 'templates'>,
): string {
  const defaultConfig = getDefaultCodeflowConfig();

  if (config.reviewComments.replyTemplate !== defaultConfig.reviewComments.replyTemplate) {
    return config.reviewComments.replyTemplate;
  }

  return config.templates.reviewReply;
}

function buildReplyBody(item: CodeflowReviewFixItem): string {
  switch (item.classification) {
    case 'valid':
      return compactBlankLines([
        item.commitSha ? `Addressed in \`${item.commitSha}\`.` : 'Addressed with the current review fix.',
        '',
        'What changed:',
        formatMarkdownBulletList([item.fixSummary ?? ''], 'Fix summary was not provided.'),
        '',
        'Verification:',
        formatMarkdownBulletList(item.verification, 'No verification provided.'),
        '',
        item.resolveRequested
          ? 'I am resolving this thread because the finding was fixed and verification passed.'
          : 'I am leaving this thread unresolved until resolution is explicitly applied.',
      ].join('\n'));
    case 'already_fixed':
      return compactBlankLines([
        'I verified this is already addressed.',
        '',
        'Evidence:',
        formatMarkdownBulletList([item.fixSummary ?? ''], 'Evidence was not provided.'),
        '',
        'Verification:',
        formatMarkdownBulletList(item.verification, 'No verification provided.'),
        '',
        item.resolveRequested
          ? 'I am resolving this thread because the current code already satisfies the review comment and verification passed.'
          : 'I am leaving this thread unresolved until resolution is explicitly applied.',
      ].join('\n'));
    case 'stale':
      return compactBlankLines([
        'I verified this thread is stale for the current diff.',
        '',
        'Evidence:',
        formatMarkdownBulletList([item.fixSummary ?? ''], 'Stale evidence was not provided.'),
        '',
        'Verification:',
        formatMarkdownBulletList(item.verification, 'No verification provided.'),
        '',
        item.resolveRequested
          ? 'I am resolving this thread because it no longer applies and verification passed.'
          : 'I am leaving this thread unresolved until resolution is explicitly applied.',
      ].join('\n'));
    case 'invalid':
      return compactBlankLines([
        'I reviewed this comment and believe it does not apply to the current code.',
        '',
        'Rationale:',
        formatMarkdownBulletList([item.fixSummary ?? item.humanDecision ?? item.replyBody ?? ''], 'Rationale was not provided.'),
        '',
        'Verification:',
        formatMarkdownBulletList(item.verification, 'No verification provided.'),
        '',
        item.resolveRequested
          ? 'Resolution was requested, but invalid-thread resolution is controlled by project policy.'
          : 'I am not resolving this thread automatically.',
      ].join('\n'));
    case 'needs_human':
      return compactBlankLines([
        'This needs a human decision before Codeflow can safely proceed.',
        '',
        'Decision needed:',
        formatMarkdownBulletList([item.humanDecision ?? item.fixSummary ?? item.replyBody ?? ''], 'Human decision reason was not provided.'),
        '',
        'No automatic resolution is allowed for `needs_human` threads.',
      ].join('\n'));
    default:
      return assertNever(item.classification);
  }
}

function buildResolutionLine(item: CodeflowReviewFixItem): string {
  if (item.classification === 'needs_human') {
    return 'Not resolved automatically; human decision required.';
  }

  if (!item.resolveRequested) {
    return 'Resolution was not requested in the review-fix payload.';
  }

  return 'Resolution requested only after policy and verification gates pass.';
}

async function loadBundledDefaultTemplate(configuredPath: string): Promise<LoadedReviewReplyTemplate> {
  const bundledPath = getBundledDefaultReviewReplyTemplatePath();

  try {
    return {
      text: await readFile(bundledPath, 'utf8'),
      templatePath: bundledPath,
      usedDefaultTemplate: true,
      warnings: [
        `Configured review reply template ${configuredPath} was not found; using bundled default review reply template.`,
      ],
    };
  } catch (error) {
    throw new CodeflowReviewFixError({
      code: 'template_unreadable',
      message: `Bundled review reply template could not be read: ${bundledPath}`,
      details: { configuredPath, bundledPath },
      cause: error,
    });
  }
}

function getReviewReplyTemplateCandidates(templatePath: string, cwd: string): string[] {
  if (path.isAbsolute(templatePath)) {
    return [templatePath];
  }

  const packageRoot = getPackageRoot();
  return [path.resolve(cwd, templatePath), path.resolve(packageRoot, templatePath)];
}

function getBundledDefaultReviewReplyTemplatePath(): string {
  return path.resolve(getPackageRoot(), DEFAULT_REVIEW_REPLY_TEMPLATE_PATH);
}

function getPackageRoot(): string {
  return fileURLToPath(new URL('../../', import.meta.url));
}

async function statTemplateCandidate(
  candidate: string,
): Promise<'file' | 'missing' | 'not_file'> {
  try {
    const stats = await stat(candidate);
    return stats.isFile() ? 'file' : 'not_file';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'missing';
    }

    throw new CodeflowReviewFixError({
      code: 'template_unreadable',
      message: `Review reply template could not be inspected: ${candidate}`,
      details: { templatePath: candidate },
      cause: error,
    });
  }
}

function assertNoUnresolvedPlaceholders(body: string): void {
  if (!hasUnresolvedTemplatePlaceholders(body)) {
    return;
  }

  throw new CodeflowReviewFixError({
    code: 'unresolved_template_placeholder',
    message: 'Rendered review reply contains unresolved template placeholders.',
    details: { placeholders: listUnresolvedTemplatePlaceholders(body) },
  });
}

function assertSafeReplyBody(body: string, item: CodeflowReviewFixItem): void {
  if (body.length === 0) {
    throw new CodeflowReviewFixError({
      code: 'unexpected_response',
      message: 'Rendered review reply is empty.',
    });
  }

  if (body.length > MAX_REPLY_BODY_CHARS) {
    throw new CodeflowReviewFixError({
      code: 'unexpected_response',
      message: `Rendered review reply exceeds ${MAX_REPLY_BODY_CHARS} characters.`,
      details: { maxLength: MAX_REPLY_BODY_CHARS },
    });
  }

  if (item.classification === 'needs_human' && /resolv(?:e|ing|ed)/i.test(body) && !body.includes('No automatic resolution')) {
    throw new CodeflowReviewFixError({
      code: 'policy_blocked',
      message: 'Rendered needs_human reply must not imply automatic resolution.',
      details: { threadId: item.threadId },
    });
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unhandled review-fix classification: ${String(value)}`);
}
