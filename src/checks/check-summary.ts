import { formatDurationMs } from '../utils/time';
import type { CodeflowCheckResult, CodeflowCheckRunResult } from './check-result';
import { isFailedCheckStatus } from './check-policy';

const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const MAX_OUTPUT_LINES = 8;
const MAX_OUTPUT_CHARS = 2000;
const MAX_RESULT_SUMMARY_CHARS = 500;

export function summarizeCheckResults(result: CodeflowCheckRunResult): string {
  if (result.status === 'no_checks') {
    return [
      'No checks are configured.',
      '',
      'Next expected actions:',
      '- Add checks to .pi/codeflow.json when local verification is required.',
      '- Continue only with an explicit note that local checks were not configured.',
    ].join('\n');
  }

  if (result.status === 'skipped') {
    return [
      'Codeflow checks skipped.',
      '',
      ...result.results.map(formatCompactResultLine),
      '',
      'Next expected action:',
      'Run `/flow-check` without `--dry-run` when ready to verify locally.',
    ].join('\n');
  }

  if (result.status === 'passed') {
    const optionalFailures = result.results.filter(
      (check) => !check.required && isFailedCheckStatus(check.status),
    );
    const header = optionalFailures.length > 0
      ? 'Codeflow required checks passed.'
      : 'Codeflow checks passed.';
    const lines = [
      header,
      '',
      ...result.results.map(formatCompactResultLine),
    ];

    if (optionalFailures.length > 0) {
      lines.push('', 'Optional check failures:', ...optionalFailures.map(formatFailureLine));
    }

    lines.push(
      '',
      'Next expected action:',
      'Proceed to self-review; do not commit, push, or open a PR from `/flow-check`.',
    );

    return lines.join('\n');
  }

  const failedRequiredChecks = result.results.filter(
    (check) => check.required && isFailedCheckStatus(check.status),
  );
  const failedOptionalChecks = result.results.filter(
    (check) => !check.required && isFailedCheckStatus(check.status),
  );
  const lines = [
    'Codeflow checks failed.',
    '',
    failedRequiredChecks.length === 1 ? 'Failed required check:' : 'Failed required checks:',
    ...failedRequiredChecks.map(formatFailureLine),
  ];

  if (failedOptionalChecks.length > 0) {
    lines.push('', 'Failed optional checks:', ...failedOptionalChecks.map(formatFailureLine));
  }

  for (const check of [...failedRequiredChecks, ...failedOptionalChecks]) {
    const output = getRelevantOutput(check);

    if (output.length > 0) {
      lines.push('', `Last output lines for ${check.name}:`, output);
    }
  }

  lines.push(
    '',
    'Next expected action:',
    'Fix the failing check output, then run `/flow-check` again.',
  );

  return lines.join('\n');
}

export function summarizeSingleCheckResult(result: CodeflowCheckResult): string {
  if (result.status === 'passed') {
    return `${result.name} passed in ${formatDurationMs(result.durationMs)}.`;
  }

  if (result.status === 'skipped') {
    return `${result.name} skipped.`;
  }

  if (result.status === 'timed_out') {
    return `${result.name} timed out after ${formatDurationMs(result.durationMs)}.`;
  }

  return `${result.name} exited with code ${result.exitCode ?? 'unknown'} after ${formatDurationMs(result.durationMs)}.`;
}

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

export function truncateForSummary(value: string, maxChars = MAX_RESULT_SUMMARY_CHARS): string {
  const normalized = stripAnsi(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (normalized.length <= maxChars) {
    return normalized;
  }

  const suffix = normalized.slice(-(maxChars - 32));
  return `[truncated ${normalized.length - suffix.length} chars]\n${suffix}`;
}

function formatCompactResultLine(result: CodeflowCheckResult): string {
  const command = result.command;
  const required = result.required ? '' : ' (optional)';

  if (result.status === 'passed') {
    return `- ${result.name}: passed${required} in ${formatDurationMs(result.durationMs)}`;
  }

  if (result.status === 'skipped') {
    return `- ${result.name}: skipped${required}`;
  }

  if (result.status === 'timed_out') {
    return `- ${result.name}: timed out${required} after ${formatDurationMs(result.durationMs)} (${command})`;
  }

  return `- ${result.name}: failed${required} with exit code ${result.exitCode ?? 'unknown'} after ${formatDurationMs(result.durationMs)} (${command})`;
}

function formatFailureLine(result: CodeflowCheckResult): string {
  if (result.status === 'timed_out') {
    return `- ${result.name}: \`${result.command}\` timed out after ${formatDurationMs(result.durationMs)}`;
  }

  return `- ${result.name}: \`${result.command}\` exited with code ${result.exitCode ?? 'unknown'} after ${formatDurationMs(result.durationMs)}`;
}

function getRelevantOutput(result: CodeflowCheckResult): string {
  const stderr = tailOutput(result.stderr);

  if (stderr.length > 0) {
    return stderr;
  }

  return tailOutput(result.stdout);
}

function tailOutput(value: string): string {
  const normalized = truncateForSummary(value, MAX_OUTPUT_CHARS).trimEnd();

  if (normalized.length === 0) {
    return '';
  }

  const lines = normalized.split('\n');
  const lastLines = lines.slice(-MAX_OUTPUT_LINES).join('\n');

  if (lines.length <= MAX_OUTPUT_LINES) {
    return lastLines;
  }

  return `[truncated to last ${MAX_OUTPUT_LINES} lines]\n${lastLines}`;
}
