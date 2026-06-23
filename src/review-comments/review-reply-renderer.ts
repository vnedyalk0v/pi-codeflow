import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import { redactSecrets } from '../utils/redaction';
import { renderSimpleTemplate } from '../utils/template';
import {
  loadTemplateWithBundledDefault,
  type LoadedTextTemplate,
} from '../utils/template-loader';
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

export type LoadedReviewReplyTemplate = LoadedTextTemplate;

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
  return loadTemplateWithBundledDefault({
    templatePath: configuredPath,
    cwd,
    templateName: 'Review reply',
    defaultTemplatePath: DEFAULT_REVIEW_REPLY_TEMPLATE_PATH,
    warning: (templatePath) =>
      `Configured review reply template ${templatePath} was not found; using bundled default review reply template.`,
    createError: (options) => new CodeflowReviewFixError({
      code: 'template_unreadable',
      ...options,
    }),
  });
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
          ? 'Resolution has been requested and will be applied separately after policy gates pass.'
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
          ? 'Resolution has been requested and will be applied separately after policy gates pass.'
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
          ? 'Resolution has been requested and will be applied separately after policy gates pass.'
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
