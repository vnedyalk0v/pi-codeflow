import { GhClient, type GhClientLike } from './gh-client';
import { GithubCliError, CodeflowPrChecksError } from './github-errors';
import {
  buildCodeflowPrChecksResult,
  parseGitHubPrChecksJson,
  type CodeflowPrChecksResult,
} from './pr-checks-parser';

export const GH_PR_CHECKS_JSON_FIELDS = [
  'bucket',
  'completedAt',
  'description',
  'event',
  'link',
  'name',
  'startedAt',
  'state',
  'workflow',
].join(',');

export interface GetGitHubPrChecksOptions {
  cwd?: string;
  pr?: number | string;
  requiredOnly?: boolean;
  watched?: boolean;
  ghClient?: GhClientLike;
  now?: Date;
}

export interface WatchGitHubPrChecksOptions extends GetGitHubPrChecksOptions {
  failFast?: boolean;
  intervalSeconds?: number;
  timeoutSeconds?: number;
  sleep?: (ms: number) => Promise<void>;
  nowMs?: () => number;
}

interface PullRequestMetadata {
  number: number | null;
  url: string | null;
  baseBranch: string | null;
  headBranch: string | null;
  headSha: string | null;
}

interface GitHubPrViewJson {
  number?: unknown;
  url?: unknown;
  baseRefName?: unknown;
  headRefName?: unknown;
  headRefOid?: unknown;
}

export async function getGitHubPrChecks(
  options: GetGitHubPrChecksOptions = {},
): Promise<CodeflowPrChecksResult> {
  const cwd = options.cwd ?? process.cwd();
  const requiredOnly = options.requiredOnly !== false;
  const ghClient = options.ghClient ?? new GhClient({ cwd });
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const metadata = await getPullRequestMetadata(ghClient, options.pr);
  const args = buildGetPrChecksArgs(metadata.number ?? options.pr, requiredOnly);
  const warnings: string[] = [];
  let stdout: string;

  try {
    const result = await ghClient.run(args);
    stdout = result.stdout;
  } catch (error) {
    if (error instanceof GithubCliError && looksLikeNoChecksMessage(error)) {
      return emptyChecksResult({
        metadata,
        requiredOnly,
        watched: options.watched === true,
        startedAt,
        startedAtMs,
        warnings: ['No GitHub PR checks were found; Codeflow will not claim remote verification.'],
      });
    }

    if (shouldParseChecksStdout(error)) {
      stdout = error.stdout;

      if (isExitCode(error.exitCode, 8)) {
        warnings.push('GitHub reported pending checks while returning check rows.');
      }
    } else {
      throw mapGithubCliError(error, options.pr !== undefined ? 'pr_not_found' : 'no_pr_found');
    }
  }

  const finishedAtMs = Date.now();
  const finishedAt = new Date(finishedAtMs).toISOString();

  return parseGitHubPrChecksJson(stdout, {
    prNumber: metadata.number,
    prUrl: metadata.url,
    baseBranch: metadata.baseBranch,
    headBranch: metadata.headBranch,
    headSha: metadata.headSha,
    requiredOnly,
    watched: options.watched === true,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    now: options.now,
    warnings,
  });
}

export async function watchGitHubPrChecks(
  options: WatchGitHubPrChecksOptions = {},
): Promise<import('./pr-checks-parser').CodeflowPrChecksWatchResult> {
  const intervalSeconds = options.intervalSeconds ?? 10;
  const timeoutSeconds = options.timeoutSeconds ?? 900;
  assertPositiveSeconds(intervalSeconds, 'intervalSeconds');
  assertPositiveSeconds(timeoutSeconds, 'timeoutSeconds');

  const sleep = options.sleep ?? defaultSleep;
  const nowMs = options.nowMs ?? Date.now;
  const startedAtMs = nowMs();
  const timeoutMs = timeoutSeconds * 1000;
  let attempts = 0;
  let latest: CodeflowPrChecksResult | null = null;

  while (true) {
    const beforePollMs = nowMs();

    if (latest !== null && beforePollMs - startedAtMs >= timeoutMs) {
      return finalizeWatchResult(latest, {
        startedAtMs,
        finishedAtMs: beforePollMs,
        attempts,
        timedOut: true,
      });
    }

    attempts += 1;
    latest = await getGitHubPrChecks({
      ...options,
      watched: true,
    });

    const afterPollMs = nowMs();

    if (shouldStopWatching(latest, options.failFast === true)) {
      return finalizeWatchResult(latest, {
        startedAtMs,
        finishedAtMs: afterPollMs,
        attempts,
        timedOut: false,
      });
    }

    const elapsedMs = afterPollMs - startedAtMs;

    if (elapsedMs >= timeoutMs) {
      return finalizeWatchResult(latest, {
        startedAtMs,
        finishedAtMs: afterPollMs,
        attempts,
        timedOut: true,
      });
    }

    await sleep(Math.min(intervalSeconds * 1000, Math.max(0, timeoutMs - elapsedMs)));
  }
}

export function buildGetPrChecksArgs(pr: number | string | null | undefined, requiredOnly: boolean): string[] {
  const args = ['pr', 'checks'];

  if (pr !== undefined && pr !== null) {
    args.push(String(pr));
  }

  if (requiredOnly) {
    args.push('--required');
  }

  args.push('--json', GH_PR_CHECKS_JSON_FIELDS);
  return args;
}

export function buildWatchPrChecksArgs(options: {
  pr: number | string;
  requiredOnly?: boolean;
  failFast?: boolean;
  intervalSeconds?: number;
}): string[] {
  const args = ['pr', 'checks', String(options.pr)];

  if (options.requiredOnly !== false) {
    args.push('--required');
  }

  args.push('--watch');

  if (options.failFast) {
    args.push('--fail-fast');
  }

  args.push('--interval', String(options.intervalSeconds ?? 10));
  return args;
}

function buildPrViewArgs(pr: number | string | undefined): string[] {
  const args = ['pr', 'view'];

  if (pr !== undefined) {
    args.push(String(pr));
  }

  args.push('--json', 'number,url,baseRefName,headRefName,headRefOid');
  return args;
}

async function getPullRequestMetadata(
  ghClient: GhClientLike,
  pr: number | string | undefined,
): Promise<PullRequestMetadata> {
  try {
    const result = await ghClient.run(buildPrViewArgs(pr));
    return parsePullRequestMetadata(result.stdout);
  } catch (error) {
    throw mapGithubCliError(error, pr !== undefined ? 'pr_not_found' : 'no_pr_found');
  }
}

function parsePullRequestMetadata(stdout: string): PullRequestMetadata {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch (error) {
    throw new CodeflowPrChecksError({
      code: 'unknown_json',
      message: 'GitHub CLI returned invalid JSON for pull request metadata.',
      details: { outputPreview: stdout.slice(0, 1000) },
      cause: error,
    });
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CodeflowPrChecksError({
      code: 'unknown_json',
      message: 'GitHub CLI returned an unexpected pull request metadata JSON shape.',
    });
  }

  const view = parsed as GitHubPrViewJson;
  return {
    number: typeof view.number === 'number' && Number.isInteger(view.number) ? view.number : null,
    url: typeof view.url === 'string' ? view.url : null,
    baseBranch: typeof view.baseRefName === 'string' ? view.baseRefName : null,
    headBranch: typeof view.headRefName === 'string' ? view.headRefName : null,
    headSha: typeof view.headRefOid === 'string' ? view.headRefOid : null,
  };
}

function emptyChecksResult(options: {
  metadata: PullRequestMetadata;
  requiredOnly: boolean;
  watched: boolean;
  startedAt: string;
  startedAtMs: number;
  warnings: string[];
}): CodeflowPrChecksResult {
  const finishedAtMs = Date.now();
  return buildCodeflowPrChecksResult([], {
    prNumber: options.metadata.number,
    prUrl: options.metadata.url,
    baseBranch: options.metadata.baseBranch,
    headBranch: options.metadata.headBranch,
    headSha: options.metadata.headSha,
    requiredOnly: options.requiredOnly,
    watched: options.watched,
    startedAt: options.startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: Math.max(0, finishedAtMs - options.startedAtMs),
    warnings: options.warnings,
  });
}

function shouldStopWatching(result: CodeflowPrChecksResult, failFast: boolean): boolean {
  if (result.status === 'no_checks') {
    return false;
  }

  if (result.status === 'unknown') {
    return true;
  }

  if (failFast && result.failedChecks.length > 0) {
    return true;
  }

  return result.pendingChecks.length === 0;
}

function finalizeWatchResult(
  result: CodeflowPrChecksResult,
  options: {
    startedAtMs: number;
    finishedAtMs: number;
    attempts: number;
    timedOut: boolean;
  },
): import('./pr-checks-parser').CodeflowPrChecksWatchResult {
  const warnings = [...result.warnings];

  if (options.timedOut) {
    warnings.push('GitHub checks watch timed out before completion.');
  }

  const finalized = buildCodeflowPrChecksResult(result.checks, {
    prNumber: result.prNumber,
    prUrl: result.prUrl,
    baseBranch: result.baseBranch,
    headBranch: result.headBranch,
    headSha: result.headSha,
    requiredOnly: result.requiredOnly,
    watched: true,
    startedAt: new Date(options.startedAtMs).toISOString(),
    finishedAt: new Date(options.finishedAtMs).toISOString(),
    durationMs: Math.max(0, options.finishedAtMs - options.startedAtMs),
    warnings,
  });

  return {
    ...finalized,
    attempts: options.attempts,
    timedOut: options.timedOut,
  };
}

function shouldParseChecksStdout(error: unknown): error is GithubCliError {
  return (
    error instanceof GithubCliError &&
    error.code === 'gh_command_failed' &&
    error.stdout.trim().length > 0
  );
}

function mapGithubCliError(error: unknown, notFoundCode: 'no_pr_found' | 'pr_not_found'): CodeflowPrChecksError {
  if (error instanceof CodeflowPrChecksError) {
    return error;
  }

  if (!(error instanceof GithubCliError)) {
    return new CodeflowPrChecksError({
      code: 'gh_command_failed',
      message: error instanceof Error ? error.message : 'GitHub CLI command failed.',
      cause: error,
    });
  }

  if (error.code === 'gh_missing') {
    return new CodeflowPrChecksError({
      code: 'gh_missing',
      message: error.message,
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (error.code === 'gh_auth_required') {
    return new CodeflowPrChecksError({
      code: 'gh_auth_required',
      message: error.message,
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  const text = `${error.stdout}\n${error.stderr}\n${error.message}`;

  if (looksLikeRepositoryNotFound(text)) {
    return new CodeflowPrChecksError({
      code: 'repository_not_found',
      message: 'GitHub repository was not found for this working tree.',
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (looksLikePermissionDenied(text)) {
    return new CodeflowPrChecksError({
      code: 'permission_denied',
      message: 'GitHub denied access to pull request checks for this repository.',
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (looksLikeNetworkFailure(text)) {
    return new CodeflowPrChecksError({
      code: 'network_error',
      message: 'GitHub CLI could not reach GitHub while reading pull request checks.',
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (looksLikeNoPrFound(text)) {
    return new CodeflowPrChecksError({
      code: notFoundCode,
      message: notFoundCode === 'pr_not_found'
        ? 'The requested pull request was not found.'
        : 'No pull request was found for the current branch.',
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  return new CodeflowPrChecksError({
    code: 'gh_command_failed',
    message: `gh ${error.args.join(' ')} failed: ${error.message}`,
    details: githubErrorDetails(error),
    cause: error,
  });
}

function looksLikeNoChecksMessage(error: GithubCliError): boolean {
  return /no (?:required\s+)?checks? (?:reported|found)|no (?:required\s+)?check runs?/i.test(
    `${error.stdout}\n${error.stderr}\n${error.message}`,
  );
}

function looksLikeNoPrFound(value: string): boolean {
  return /no pull requests? found|pull request not found|could not resolve.*pull request|not found/i.test(value);
}

function looksLikeRepositoryNotFound(value: string): boolean {
  return /repository not found|could not resolve to a repository|http\s+404/i.test(value);
}

function looksLikePermissionDenied(value: string): boolean {
  return /permission denied|resource not accessible|forbidden|http\s+403|not authorized/i.test(value);
}

function looksLikeNetworkFailure(value: string): boolean {
  return /network|timeout|timed out|tls|connection|temporary failure|could not resolve host|eof/i.test(value);
}

function githubErrorDetails(error: GithubCliError): Record<string, unknown> {
  return {
    args: error.args,
    exitCode: error.exitCode ?? null,
    stdout: error.stdout.slice(0, 1000),
    stderr: error.stderr.slice(0, 1000),
  };
}

function assertPositiveSeconds(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new CodeflowPrChecksError({
      code: 'invalid_arguments',
      message: `${name} must be greater than zero.`,
      details: { [name]: value },
    });
  }
}

function isExitCode(value: number | string | null | undefined, expected: number): boolean {
  return value === expected || value === String(expected);
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
