import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import { renderSimpleTemplate } from '../utils/template';
import {
  hasUnresolvedTemplatePlaceholders,
  listUnresolvedTemplatePlaceholders,
} from '../utils/text';
import { CodeflowPrError } from './pr-errors';
import type { CodeflowPrBodyPayload, CodeflowPrPayload, CodeflowPrTitlePayload } from './pr-payload';

export function renderPrTitle(
  title: CodeflowPrTitlePayload | CodeflowPrPayload,
  config: Pick<CodeflowConfig, 'pullRequest'> = getDefaultCodeflowConfig(),
): string {
  const titlePayload = 'title' in title ? title.title : title;
  const scopeSuffix = titlePayload.scope ? `(${titlePayload.scope})` : '';
  const ticketPrefix = titlePayload.ticket ? `[${titlePayload.ticket}] ` : '';
  const template = config.pullRequest.titleTemplate;

  const rendered = renderSimpleTemplate(template, {
    type: titlePayload.type,
    scope: titlePayload.scope ?? '',
    scopeSuffix,
    summary: titlePayload.summary,
    ticket: titlePayload.ticket ?? '',
    ticketPrefix,
  }).trim();

  if (hasUnresolvedTemplatePlaceholders(rendered)) {
    throw new CodeflowPrError({
      code: 'unresolved_template_placeholder',
      message: 'Rendered PR title contains unresolved template placeholders.',
      details: { placeholders: listUnresolvedTemplatePlaceholders(rendered) },
    });
  }

  return rendered;
}

export function getPrRefs(payload: CodeflowPrPayload | CodeflowPrBodyPayload): string[] {
  const body = 'body' in payload ? payload.body : payload;
  return [...(body.refs ?? [])];
}

export function summarizePrPayload(payload: CodeflowPrPayload): string {
  return payload.body.summary;
}

