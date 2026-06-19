import type {
  CodeflowPrCheck,
  CodeflowPrChecksAggregateStatus,
  CodeflowPrChecksResult,
} from '../github/pr-checks-parser';
import { truncateText } from '../utils/text';

const MAX_STORED_SUMMARY_CHARS = 2000;
const MAX_STORED_CHECKS = 100;

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
    name: check.name,
    workflow: check.workflow,
    status: check.status,
    detailsUrl: check.detailsUrl,
    durationMs: check.durationMs,
    required: check.required,
  };
}
