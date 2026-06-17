import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import {
  compactBlankLines,
  formatMarkdownBulletList,
  hasUnresolvedTemplatePlaceholders,
  listUnresolvedTemplatePlaceholders,
} from '../utils/text';
import { CodeflowPrError } from './pr-errors';
import { normalizePrPayload } from './pr-payload-validation';
import type { CodeflowPrPayload, CodeflowPrRenderResult } from './pr-payload';
import { renderPrTitle } from './pr-summary';
import { loadPrTemplate } from './pr-template';

export interface RenderPrBodyOptions {
  cwd?: string;
  config?: Pick<CodeflowConfig, 'pullRequest' | 'templates'>;
  templateText?: string;
  templatePath?: string | null;
  usedDefaultTemplate?: boolean;
}

export async function renderPrBody(
  payloadInput: CodeflowPrPayload,
  options: RenderPrBodyOptions = {},
): Promise<CodeflowPrRenderResult> {
  const config = options.config ?? getDefaultCodeflowConfig();
  const payload = normalizePrPayload(payloadInput);
  const loadedTemplate = options.templateText === undefined
    ? await loadPrTemplate(config, options.cwd ?? process.cwd())
    : {
        text: options.templateText,
        templatePath: options.templatePath ?? null,
        usedDefaultTemplate: options.usedDefaultTemplate ?? false,
        warnings: [],
      };
  const title = renderPrTitle(payload.title, config);
  const body = compactBlankLines(renderSimpleTemplate(loadedTemplate.text, {
    title,
    type: payload.title.type,
    scope: payload.title.scope ?? '',
    scopeSuffix: payload.title.scope ? `(${payload.title.scope})` : '',
    summary: payload.body.summary,
    context: payload.body.context,
    changesList: formatMarkdownBulletList(payload.body.changes, 'No changes provided.'),
    verificationList: formatMarkdownChecklist(
      payload.body.verification ?? [],
      'Not provided; unverified PR payload was explicitly allowed.',
    ),
    selfReviewList: formatMarkdownChecklist(
      payload.body.selfReview ?? [],
      'Not provided; self-review was explicitly allowed to be omitted.',
    ),
    risk: payload.body.risk,
    rollback: payload.body.rollback,
    reviewerNotes: payload.body.reviewerNotes && payload.body.reviewerNotes.length > 0
      ? payload.body.reviewerNotes
      : 'None.',
    linkedIssuesList: formatLinkedIssues(payload.body.refs ?? [], config.pullRequest.linkKeyword),
    refsList: formatLinkedIssues(payload.body.refs ?? [], config.pullRequest.linkKeyword),
  }));

  assertNoUnresolvedPlaceholders(body);
  assertPrBody(body);

  return {
    title,
    body,
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

function formatMarkdownChecklist(items: string[], emptyItem: string): string {
  const values = items.map((item) => item.trim()).filter((item) => item.length > 0);

  if (values.length === 0) {
    return `- [ ] ${emptyItem}`;
  }

  return values.map((item) => `- [x] ${indentMultilineChecklistItem(item)}`).join('\n');
}

function indentMultilineChecklistItem(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\n  ');
}

function formatLinkedIssues(refs: string[], keyword: string): string {
  const normalizedRefs = refs.map((ref) => normalizeIssueReference(ref, keyword)).filter(Boolean);

  if (normalizedRefs.length === 0) {
    return 'None.';
  }

  return normalizedRefs.join('\n');
}

function normalizeIssueReference(ref: string, keyword: string): string {
  const trimmed = ref.trim();

  if (trimmed.length === 0) {
    return '';
  }

  const withoutKeyword = trimmed.replace(/^(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?)\s+/i, '');
  return `${keyword} ${withoutKeyword}`;
}

function assertNoUnresolvedPlaceholders(body: string): void {
  if (!hasUnresolvedTemplatePlaceholders(body)) {
    return;
  }

  throw new CodeflowPrError({
    code: 'unresolved_template_placeholder',
    message: 'Rendered PR body contains unresolved template placeholders.',
    details: { placeholders: listUnresolvedTemplatePlaceholders(body) },
  });
}

function assertPrBody(body: string): void {
  const requiredSections = [
    '## Summary',
    '## Context',
    '## Changes',
    '## Verification',
    '## Self-review',
    '## Risk',
    '## Rollback',
    '## Reviewer notes',
    '## Linked issues',
  ];
  const missingSections = requiredSections.filter((section) => !body.includes(section));

  if (body.length === 0 || missingSections.length > 0) {
    throw new CodeflowPrError({
      code: 'missing_pr_body',
      message: 'Rendered PR body must include the standard Codeflow PR sections.',
      details: { missingSections },
    });
  }
}
