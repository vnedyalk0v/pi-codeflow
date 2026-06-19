import { CodeflowPrChecksError } from './github-errors';
import {
  getChecksByStatus,
  getPrChecksAggregateStatus,
} from './pr-checks-policy';
import { summarizeGitHubPrChecks } from './pr-checks-summary';

export type CodeflowPrCheckStatus =
  | 'passed'
  | 'failed'
  | 'pending'
  | 'skipped'
  | 'cancelled'
  | 'timed_out'
  | 'neutral'
  | 'unknown';

export type CodeflowPrCheckBucket =
  | 'pass'
  | 'fail'
  | 'pending'
  | 'skipping'
  | 'cancel'
  | 'unknown';

export type CodeflowPrChecksAggregateStatus =
  | 'passed'
  | 'failed'
  | 'pending'
  | 'skipped'
  | 'no_checks'
  | 'unknown';

export interface CodeflowPrCheck {
  name: string;
  workflow: string | null;
  status: CodeflowPrCheckStatus;
  rawState: string;
  bucket: CodeflowPrCheckBucket;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  description: string | null;
  detailsUrl: string | null;
  required: boolean;
}

export interface CodeflowPrChecksResult {
  status: CodeflowPrChecksAggregateStatus;
  prNumber: number | null;
  prUrl: string | null;
  baseBranch: string | null;
  headBranch: string | null;
  headSha: string | null;
  requiredOnly: boolean;
  watched: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  checks: CodeflowPrCheck[];
  failedChecks: CodeflowPrCheck[];
  pendingChecks: CodeflowPrCheck[];
  passedChecks: CodeflowPrCheck[];
  skippedChecks: CodeflowPrCheck[];
  summary: string;
  warnings: string[];
}

export interface CodeflowPrChecksWatchResult extends CodeflowPrChecksResult {
  attempts: number;
  timedOut: boolean;
}

export interface GitHubPrChecksMetadata {
  prNumber?: number | null;
  prUrl?: string | null;
  baseBranch?: string | null;
  headBranch?: string | null;
  headSha?: string | null;
}

export interface ParseGitHubPrChecksOptions extends GitHubPrChecksMetadata {
  requiredOnly: boolean;
  watched?: boolean;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  now?: Date;
  warnings?: string[];
}

interface GitHubPrCheckRow {
  bucket?: unknown;
  completedAt?: unknown;
  description?: unknown;
  event?: unknown;
  link?: unknown;
  name?: unknown;
  startedAt?: unknown;
  state?: unknown;
  workflow?: unknown;
}

export function parseGitHubPrChecksJson(
  text: string,
  options: ParseGitHubPrChecksOptions,
): CodeflowPrChecksResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new CodeflowPrChecksError({
      code: 'unknown_json',
      message: 'GitHub CLI returned invalid JSON for pull request checks.',
      details: { outputPreview: text.slice(0, 1000) },
      cause: error,
    });
  }

  if (!Array.isArray(parsed)) {
    throw new CodeflowPrChecksError({
      code: 'unknown_json',
      message: 'GitHub CLI returned an unexpected pull request checks JSON shape.',
      details: { jsonType: typeof parsed },
    });
  }

  return buildCodeflowPrChecksResult(
    parsed.map((row) => normalizeGitHubPrCheck(row, {
      required: options.requiredOnly,
      now: options.now,
    })),
    options,
  );
}

export function normalizeGitHubPrCheck(
  row: unknown,
  options: { required?: boolean; now?: Date } = {},
): CodeflowPrCheck {
  const source = isRecord(row) ? row as GitHubPrCheckRow : {};
  const name = readString(source.name)?.trim() || 'unnamed GitHub check';
  const workflow = readString(source.workflow);
  const rawState = readString(source.state)?.trim() || 'unknown';
  const bucket = normalizeBucket(source.bucket);
  const status = normalizeStatus(bucket, rawState);
  const startedAt = readString(source.startedAt);
  const completedAt = readString(source.completedAt);

  return {
    name,
    workflow: workflow && workflow.length > 0 ? workflow : null,
    status,
    rawState,
    bucket,
    startedAt: normalizeTimestamp(startedAt),
    completedAt: normalizeTimestamp(completedAt),
    durationMs: calculateDurationMs(startedAt, completedAt, options.now),
    description: normalizeNullableString(source.description),
    detailsUrl: normalizeNullableString(source.link),
    required: options.required === true,
  };
}

export function buildCodeflowPrChecksResult(
  checks: CodeflowPrCheck[],
  options: ParseGitHubPrChecksOptions,
): CodeflowPrChecksResult {
  const startedAt = options.startedAt ?? new Date().toISOString();
  const finishedAt = options.finishedAt ?? startedAt;
  const durationMs = options.durationMs ?? 0;
  const warnings = [...(options.warnings ?? []), ...collectCheckWarnings(checks)];

  if (checks.length === 0) {
    warnings.push('No GitHub PR checks were found; Codeflow will not claim remote verification.');
  }

  const status = getPrChecksAggregateStatus(checks);
  const grouped = getChecksByStatus(checks);
  const resultWithoutSummary: Omit<CodeflowPrChecksResult, 'summary'> = {
    status,
    prNumber: normalizePrNumber(options.prNumber),
    prUrl: options.prUrl ?? null,
    baseBranch: options.baseBranch ?? null,
    headBranch: options.headBranch ?? null,
    headSha: options.headSha ?? null,
    requiredOnly: options.requiredOnly,
    watched: options.watched === true,
    startedAt,
    finishedAt,
    durationMs,
    checks,
    ...grouped,
    warnings: uniqueWarnings(warnings),
  };

  const result = {
    ...resultWithoutSummary,
    summary: '',
  } satisfies CodeflowPrChecksResult;

  return {
    ...result,
    summary: summarizeGitHubPrChecks(result),
  };
}

function normalizeBucket(value: unknown): CodeflowPrCheckBucket {
  const bucket = readString(value)?.trim().toLowerCase();

  if (
    bucket === 'pass' ||
    bucket === 'fail' ||
    bucket === 'pending' ||
    bucket === 'skipping' ||
    bucket === 'cancel'
  ) {
    return bucket;
  }

  return 'unknown';
}

function normalizeStatus(
  bucket: CodeflowPrCheckBucket,
  rawState: string,
): CodeflowPrCheckStatus {
  const state = rawState.trim().toLowerCase().replace(/[\s-]+/g, '_');

  if (isTimedOutState(state)) {
    return 'timed_out';
  }

  if (isCancelledState(state)) {
    return 'cancelled';
  }

  if (isSkippedState(state)) {
    return 'skipped';
  }

  if (isNeutralState(state)) {
    return bucket === 'pass' ? 'passed' : 'neutral';
  }

  if (bucket === 'pass') {
    return 'passed';
  }

  if (bucket === 'fail') {
    return 'failed';
  }

  if (bucket === 'pending') {
    return 'pending';
  }

  if (bucket === 'skipping') {
    return 'skipped';
  }

  if (bucket === 'cancel') {
    return 'cancelled';
  }

  if (isPassedState(state)) {
    return 'passed';
  }

  if (isFailedState(state)) {
    return 'failed';
  }

  if (isPendingState(state)) {
    return 'pending';
  }

  return 'unknown';
}

function isPassedState(state: string): boolean {
  return state === 'success' || state === 'passed' || state === 'completed_success';
}

function isFailedState(state: string): boolean {
  return [
    'failure',
    'failed',
    'error',
    'action_required',
    'startup_failure',
    'completed_failure',
  ].includes(state);
}

function isPendingState(state: string): boolean {
  return [
    'queued',
    'requested',
    'waiting',
    'pending',
    'in_progress',
    'running',
    'expected',
  ].includes(state);
}

function isSkippedState(state: string): boolean {
  return state === 'skipped' || state === 'skip' || state === 'completed_skipped';
}

function isCancelledState(state: string): boolean {
  return state === 'cancelled' || state === 'canceled' || state === 'cancel';
}

function isTimedOutState(state: string): boolean {
  return state === 'timed_out' || state === 'timeout' || state === 'timedout';
}

function isNeutralState(state: string): boolean {
  return state === 'neutral';
}

function calculateDurationMs(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const start = parseTimestampMs(startedAt);

  if (start === null) {
    return null;
  }

  const end = parseTimestampMs(completedAt) ?? now.getTime();
  return Math.max(0, end - start);
}

function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return Number.isFinite(Date.parse(value)) ? value : null;
}

function collectCheckWarnings(checks: CodeflowPrCheck[]): string[] {
  const warnings: string[] = [];

  for (const check of checks) {
    if (check.bucket === 'unknown' && check.status === 'unknown') {
      warnings.push(
        `GitHub check ${check.name} returned unknown state ${check.rawState}; status was treated as unknown.`,
      );
    }
  }

  return warnings;
}

function normalizePrNumber(value: number | null | undefined): number | null {
  return Number.isInteger(value) && value !== null && value !== undefined && value > 0
    ? value
    : null;
}

function normalizeNullableString(value: unknown): string | null {
  const text = readString(value)?.trim();
  return text && text.length > 0 ? text : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.filter((warning) => warning.trim().length > 0))];
}
