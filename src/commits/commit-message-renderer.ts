import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import {
  compactBlankLines,
  formatMarkdownBulletList,
  hasUnresolvedTemplatePlaceholders,
  listUnresolvedTemplatePlaceholders,
} from '../utils/text';
import { CodeflowCommitError } from './commit-errors';
import { normalizeCommitPayload } from './commit-payload-validation';
import type { CodeflowCommitMessage, CodeflowCommitPayload } from './commit-payload';
import { buildCommitTitle, getCommitRefs } from './commit-summary';
import { loadCommitTemplate } from './commit-template';

export interface RenderCommitMessageOptions {
  cwd?: string;
  config?: Pick<CodeflowConfig, 'commits' | 'templates'>;
  templateText?: string;
  templatePath?: string | null;
  usedDefaultTemplate?: boolean;
}

export async function renderCommitMessage(
  payloadInput: CodeflowCommitPayload,
  options: RenderCommitMessageOptions = {},
): Promise<CodeflowCommitMessage> {
  const config = options.config ?? getDefaultCodeflowConfig();
  const payload = normalizeCommitPayload(payloadInput);
  const loadedTemplate = options.templateText === undefined
    ? await loadCommitTemplate(config, options.cwd ?? process.cwd())
    : {
        text: options.templateText,
        templatePath: options.templatePath ?? null,
        usedDefaultTemplate: options.usedDefaultTemplate ?? false,
        warnings: [],
      };
  const title = buildCommitTitle(payload, config);
  const message = compactBlankLines(renderSimpleTemplate(loadedTemplate.text, {
    title,
    type: payload.type,
    scope: payload.scope ?? '',
    scopeSuffix: payload.scope ? `(${payload.scope})` : '',
    breakingMarker: payload.breakingChange && config.commits.useBreakingChangeMarker ? '!' : '',
    summary: payload.summary,
    context: payload.context,
    changesList: formatMarkdownBulletList(payload.changes, 'No changes provided.'),
    verificationList: formatMarkdownBulletList(
      payload.verification ?? [],
      'Not provided; unverified commit payload was explicitly allowed.',
    ),
    risk:
      payload.risk && payload.risk.length > 0
        ? payload.risk
        : 'Not provided; risk was explicitly allowed to be omitted.',
    refsList: formatRefsList(payload),
    breakingChange: payload.breakingChange ?? '',
    breakingChangeLine: payload.breakingChange
      ? `BREAKING CHANGE: ${payload.breakingChange}`
      : '',
    footersList: formatFooters(payload.footers),
  }));

  assertNoUnresolvedPlaceholders(message);

  const [renderedTitle = '', ...bodyLines] = message.split('\n');
  const body = bodyLines.join('\n').trim();

  if (renderedTitle.trim().length === 0) {
    throw new CodeflowCommitError({
      code: 'missing_commit_body',
      message: 'Rendered commit message is missing a title.',
    });
  }

  assertCommitBody(body, config);

  return {
    title: renderedTitle,
    body,
    message,
    templatePath: loadedTemplate.templatePath,
    usedDefaultTemplate: loadedTemplate.usedDefaultTemplate,
    warnings: loadedTemplate.warnings,
  };
}

function renderSimpleTemplate(templateText: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    templateText,
  );
}

function assertNoUnresolvedPlaceholders(message: string): void {
  if (!hasUnresolvedTemplatePlaceholders(message)) {
    return;
  }

  throw new CodeflowCommitError({
    code: 'unresolved_template_placeholder',
    message: 'Rendered commit message contains unresolved template placeholders.',
    details: { placeholders: listUnresolvedTemplatePlaceholders(message) },
  });
}

function assertCommitBody(
  body: string,
  config: Pick<CodeflowConfig, 'commits'>,
): void {
  if (!config.commits.requireBody) {
    return;
  }

  const requiredSections = ['Context:', 'Changes:', 'Verification:', 'Risk:'];
  const missingSections = requiredSections.filter((section) => !body.includes(section));

  if (body.length === 0 || missingSections.length > 0) {
    throw new CodeflowCommitError({
      code: 'missing_commit_body',
      message:
        'Rendered commit message body must include Context, Changes, Verification, and Risk sections.',
      details: { missingSections },
    });
  }
}

function formatRefsList(payload: CodeflowCommitPayload): string {
  const refs = getCommitRefs(payload);
  return refs.length > 0 ? refs.join(', ') : 'none';
}

function formatFooters(footers: CodeflowCommitPayload['footers']): string {
  if (!footers) {
    return '';
  }

  const lines: string[] = [];

  for (const [key, value] of Object.entries(footers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        lines.push(`${key}: ${item}`);
      }
      continue;
    }

    lines.push(`${key}: ${value}`);
  }

  return lines.join('\n');
}
