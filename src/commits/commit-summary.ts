import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import type { CodeflowCommitPayload } from './commit-payload';

export function buildCommitTitle(
  payload: CodeflowCommitPayload,
  config: Pick<CodeflowConfig, 'commits'> = getDefaultCodeflowConfig(),
): string {
  const scopeSuffix = payload.scope ? `(${payload.scope})` : '';
  const breakingMarker =
    payload.breakingChange && config.commits.useBreakingChangeMarker ? '!' : '';

  return `${payload.type}${scopeSuffix}${breakingMarker}: ${payload.summary}`;
}

export function getCommitRefs(payload: CodeflowCommitPayload): string[] {
  return [...(payload.refs ?? [])];
}

export function summarizeCommitBody(message: string): string {
  const [, ...bodyLines] = message.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const body = bodyLines.join('\n').trim();

  if (body.length === 0) {
    return '';
  }

  const headings = body
    .split('\n')
    .filter((line) => /^[A-Za-z][A-Za-z ]+:$/.test(line.trim()))
    .map((line) => line.trim().replace(/:$/, ''));

  return headings.length > 0 ? headings.join(', ') : body.slice(0, 120);
}
