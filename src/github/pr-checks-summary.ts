import { truncateForSummary } from '../checks/check-summary';
import { formatDurationMs } from '../utils/time';
import type { CodeflowPrCheck, CodeflowPrChecksResult } from './pr-checks-parser';

export function summarizeGitHubPrChecks(result: CodeflowPrChecksResult): string {
  const lines = [getSummaryHeading(result), '', `PR: ${formatPullRequest(result)}`, `Mode: ${formatMode(result)}`];

  if (result.status === 'no_checks') {
    lines.push(
      '',
      'No GitHub PR checks were found.',
      '',
      'Next expected action:',
      'Confirm the PR has checks configured or wait for GitHub to create check runs, then run `/flow-watch` again.',
    );
    return lines.join('\n');
  }

  if (result.status === 'passed') {
    lines.push('', ...result.passedChecks.map((check) => formatCheckLine(check, 'passed')));
  }

  if (result.status === 'skipped') {
    lines.push('', 'Skipped:', ...result.skippedChecks.map((check) => formatCheckLine(check, 'skipped')));
  }

  if (result.failedChecks.length > 0) {
    lines.push('', 'Failed:', ...result.failedChecks.flatMap(formatFailureCheckBlock));
  }

  if (result.pendingChecks.length > 0) {
    lines.push('', 'Pending:', ...result.pendingChecks.map((check) => formatCheckLine(check, 'pending')));
  }

  if (result.status === 'unknown') {
    const unknownChecks = result.checks.filter((check) => check.status === 'unknown');
    lines.push(
      '',
      'Unknown:',
      ...(unknownChecks.length > 0
        ? unknownChecks.map((check) => formatCheckLine(check, 'unknown'))
        : ['- GitHub returned an unknown checks status.']),
    );
  }

  const skippedChecksToShow = result.status !== 'skipped' && result.skippedChecks.length > 0
    ? result.skippedChecks
    : [];

  if (skippedChecksToShow.length > 0) {
    lines.push('', 'Skipped:', ...skippedChecksToShow.map((check) => formatCheckLine(check, 'skipped')));
  }

  lines.push('', 'Next expected action:', getNextAction(result));

  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:', ...result.warnings.map((warning) => `- ${warning}`));
  }

  return lines.join('\n');
}

function getSummaryHeading(result: CodeflowPrChecksResult): string {
  if (result.warnings.some((warning) => /timed out/i.test(warning))) {
    return 'GitHub checks watch timed out before completion.';
  }

  switch (result.status) {
    case 'passed':
      return 'GitHub checks passed.';
    case 'failed':
      return 'GitHub checks failed.';
    case 'pending':
      return 'GitHub checks are still pending.';
    case 'skipped':
      return 'GitHub checks were skipped.';
    case 'no_checks':
      return 'No GitHub checks were found.';
    case 'unknown':
      return 'GitHub check status is unknown.';
    default:
      return assertNever(result.status);
  }
}

function formatPullRequest(result: CodeflowPrChecksResult): string {
  if (result.prNumber !== null) {
    return `#${result.prNumber}${result.prUrl ? ` (${result.prUrl})` : ''}`;
  }

  return result.prUrl ?? 'unknown';
}

function formatMode(result: CodeflowPrChecksResult): string {
  return result.requiredOnly ? 'required checks' : 'all checks';
}

function formatCheckLine(check: CodeflowPrCheck, context: 'passed' | 'pending' | 'skipped' | 'unknown'): string {
  const label = formatCheckLabel(check);
  const duration = formatCheckDuration(check, context);
  const status = check.status === 'timed_out' ? 'timed out' : check.status;

  return `- ${label}: ${status}${duration}`;
}

function formatFailureCheckBlock(check: CodeflowPrCheck): string[] {
  const label = formatCheckLabel(check);
  const status = check.status === 'timed_out' ? 'timed out' : check.status;
  const duration = formatCheckDuration(check, 'failed');
  const lines = [`- ${label}: ${status}${duration}`];

  if (check.detailsUrl) {
    lines.push(`  Details: ${check.detailsUrl}`);
  }

  if (check.description) {
    lines.push(`  Context: ${truncateForSummary(check.description)}`);
  }

  return lines;
}

function formatCheckLabel(check: CodeflowPrCheck): string {
  if (check.workflow && check.workflow !== check.name) {
    return `${check.name} (${check.workflow})`;
  }

  return check.name;
}

function formatCheckDuration(
  check: CodeflowPrCheck,
  context: 'passed' | 'pending' | 'skipped' | 'unknown' | 'failed',
): string {
  if (check.durationMs === null) {
    return '';
  }

  const duration = formatHumanDurationMs(check.durationMs);

  if (context === 'pending') {
    return ` for ${duration}`;
  }

  if (context === 'failed') {
    return ` after ${duration}`;
  }

  if (context === 'passed') {
    return ` in ${duration}`;
  }

  return ` (${formatDurationMs(check.durationMs)})`;
}

function formatHumanDurationMs(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '0ms';
  }

  const totalSeconds = Math.round(durationMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function getNextAction(result: CodeflowPrChecksResult): string {
  if (result.status === 'passed') {
    return 'Review PR comments, then continue with the review-comment loop when available.';
  }

  if (result.status === 'failed') {
    return 'Inspect the failed check logs, fix the issue, run `/flow-check`, commit the fix, push to the PR branch, then run `/flow-watch` again.';
  }

  if (result.status === 'pending') {
    return result.requiredOnly
      ? 'Run `/flow-watch --required` again or wait for checks to complete.'
      : 'Run `/flow-watch --all` again or wait for checks to complete.';
  }

  if (result.status === 'skipped') {
    return 'Confirm the skipped checks are expected before treating remote verification as satisfied.';
  }

  if (result.status === 'no_checks') {
    return 'Do not claim remote verification; confirm check configuration or wait for GitHub checks to appear.';
  }

  return 'Inspect GitHub check status manually, then rerun `/flow-watch` after the status is clear.';
}

function assertNever(value: never): never {
  throw new TypeError(`Unhandled GitHub checks status: ${String(value)}`);
}
