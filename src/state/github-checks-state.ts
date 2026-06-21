import type {
  CodeflowPrCheck,
  CodeflowPrChecksAggregateStatus,
  CodeflowPrChecksResult,
} from '../github/pr-checks-parser';
import { truncateText } from '../utils/text';

const MAX_STORED_SUMMARY_CHARS = 2000;
const MAX_STORED_CHECKS = 100;
const MAX_STORED_CHECK_STRING_CHARS = 500;

export interface CodeflowStoredGitHubCheck {
  name: string;
  workflow: string | null;
  status: string;
  detailsUrl: string | null;
  durationMs: number | null;
  required: boolean;
}

export interface CodeflowStoredGitHubChecksRun {
  status: CodeflowPrChecksAggregateStatus;
  prNumber: number | null;
  prUrl: string | null;
  headSha?: string | null;
  requiredOnly: boolean;
  watched: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  checks: CodeflowStoredGitHubCheck[];
  summary: string;
}

export interface CodeflowGitHubChecksState {
  lastRun: CodeflowStoredGitHubChecksRun | null;
}

export function createInitialGitHubChecksState(): CodeflowGitHubChecksState {
  return {
    lastRun: null,
  };
}

export function updateGitHubChecksStateWithResult(
  state: CodeflowGitHubChecksState,
  result: CodeflowPrChecksResult,
): CodeflowGitHubChecksState {
  return {
    ...state,
    lastRun: toStoredGitHubChecksRun(result),
  };
}

export function toStoredGitHubChecksRun(
  result: CodeflowPrChecksResult,
): CodeflowStoredGitHubChecksRun {
  return {
    status: result.status,
    prNumber: result.prNumber,
    prUrl: result.prUrl,
    headSha: result.headSha,
    requiredOnly: result.requiredOnly,
    watched: result.watched,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    checks: result.checks.slice(0, MAX_STORED_CHECKS).map(toStoredGitHubCheck),
    summary: truncateText(result.summary, MAX_STORED_SUMMARY_CHARS),
  };
}

function toStoredGitHubCheck(check: CodeflowPrCheck): CodeflowStoredGitHubCheck {
  return {
    name: truncateText(check.name, MAX_STORED_CHECK_STRING_CHARS),
    workflow: truncateNullableText(check.workflow),
    status: truncateText(check.status, MAX_STORED_CHECK_STRING_CHARS),
    detailsUrl: truncateNullableText(check.detailsUrl),
    durationMs: check.durationMs,
    required: check.required,
  };
}

function truncateNullableText(value: string | null): string | null {
  return value === null ? null : truncateText(value, MAX_STORED_CHECK_STRING_CHARS);
}
