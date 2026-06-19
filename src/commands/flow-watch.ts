import type { CodeflowConfig } from '../config/codeflow-config';
import { loadCodeflowConfig } from '../config/load-config';
import type { GhClientLike } from '../github/gh-client';
import { CodeflowPrChecksError } from '../github/github-errors';
import {
  getGitHubPrChecks,
  watchGitHubPrChecks,
  type WatchGitHubPrChecksOptions,
} from '../github/pr-checks-client';
import type { CodeflowPrChecksResult } from '../github/pr-checks-parser';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import {
  createCodeflowSessionState,
  updateSessionStateWithGitHubChecks,
  type CodeflowSessionState,
} from '../state/session-state';

export interface FlowWatchOptions {
  cwd?: string;
  pr?: number | string;
  requiredOnly?: boolean;
  watch?: boolean;
  failFast?: boolean;
  intervalSeconds?: number;
  timeoutSeconds?: number;
  dryRun?: boolean;
  config?: CodeflowConfig;
  loadConfig?: typeof loadCodeflowConfig;
  ghClient?: GhClientLike;
  sessionState?: CodeflowSessionState;
  sleep?: WatchGitHubPrChecksOptions['sleep'];
  nowMs?: WatchGitHubPrChecksOptions['nowMs'];
}

export interface FlowWatchResult {
  checks: CodeflowPrChecksResult;
  lifecyclePhase: CodeflowLifecyclePhase;
  nextExpectedActions: string[];
  warnings: string[];
  sessionState: CodeflowSessionState;
}

export interface ParsedFlowWatchArguments {
  dryRun: boolean;
  pr?: number;
  requiredOnly?: boolean;
  watch?: boolean;
  failFast?: boolean;
  intervalSeconds?: number;
  timeoutSeconds?: number;
}

export async function runFlowWatch(
  options: FlowWatchOptions = {},
): Promise<FlowWatchResult> {
  const cwd = options.cwd ?? process.cwd();
  const loadConfig = options.loadConfig ?? loadCodeflowConfig;
  const loadedConfig = options.config
    ? {
        config: options.config,
        configPath: null,
        usedDefaultConfig: false,
        validationWarnings: [],
      }
    : await loadConfig({ cwd });
  const config = loadedConfig.config;
  const sessionState = options.sessionState ?? createCodeflowSessionState({ phase: 'ci_waiting' });
  const pr = resolveTargetPrOption(options.pr, sessionState);
  const requiredOnly = options.requiredOnly ?? config.pullRequest.watchRequiredChecksOnly;
  const watch = options.watch ?? true;
  const failFast = options.failFast ?? config.pullRequest.failFast;
  const intervalSeconds = options.intervalSeconds ?? config.pullRequest.checksWatchIntervalSeconds;
  const timeoutSeconds = options.timeoutSeconds ?? config.pullRequest.checksWatchTimeoutSeconds;
  validateFlowWatchTiming(intervalSeconds, timeoutSeconds);

  if (options.dryRun) {
    const result = makeDryRunResult({
      pr,
      requiredOnly,
      watch,
      failFast,
      intervalSeconds,
      timeoutSeconds,
      sessionState,
    });

    return {
      checks: result,
      lifecyclePhase: sessionState.lifecycle.phase,
      nextExpectedActions: getFlowWatchNextExpectedActions(result),
      warnings: result.warnings,
      sessionState,
    };
  }

  const checks = watch
    ? await watchGitHubPrChecks({
        cwd,
        pr,
        requiredOnly,
        failFast,
        intervalSeconds,
        timeoutSeconds,
        ghClient: options.ghClient,
        sleep: options.sleep,
        nowMs: options.nowMs,
      })
    : await getGitHubPrChecks({
        cwd,
        pr,
        requiredOnly,
        ghClient: options.ghClient,
      });
  const warnings = [...checks.warnings];

  if (loadedConfig.usedDefaultConfig) {
    warnings.push('No project Codeflow config was found; package defaults are in use.');
  }

  const lifecyclePhase = getLifecyclePhaseForChecks(checks);
  const checksWithWarnings = warnings.length === checks.warnings.length
    ? checks
    : { ...checks, warnings };
  const nextSessionState = updateSessionStateWithGitHubChecks(
    sessionState,
    checksWithWarnings,
    lifecyclePhase,
  );

  return {
    checks: checksWithWarnings,
    lifecyclePhase,
    nextExpectedActions: getFlowWatchNextExpectedActions(checksWithWarnings),
    warnings,
    sessionState: nextSessionState,
  };
}

export function parseFlowWatchArguments(args: string): ParsedFlowWatchArguments {
  const tokens = splitCommandArguments(args);
  let dryRun = false;
  let pr: number | undefined;
  let requiredOnly: boolean | undefined;
  let watch: boolean | undefined;
  let failFast: boolean | undefined;
  let intervalSeconds: number | undefined;
  let timeoutSeconds: number | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '--dry-run' || token === '--dryRun') {
      dryRun = true;
      continue;
    }

    if (token === '--required') {
      validateRequiredMode(requiredOnly, token);
      requiredOnly = true;
      continue;
    }

    if (token === '--all') {
      validateRequiredMode(requiredOnly, token);
      requiredOnly = false;
      continue;
    }

    if (token === '--watch') {
      watch = true;
      continue;
    }

    if (token === '--once' || token === '--no-watch') {
      watch = false;
      continue;
    }

    if (token === '--fail-fast') {
      failFast = true;
      continue;
    }

    if (token === '--pr') {
      pr = parsePositiveInteger(readFlagValue(tokens, index, '--pr'), '--pr');
      index += 1;
      continue;
    }

    if (token.startsWith('--pr=')) {
      pr = parsePositiveInteger(token.slice('--pr='.length), '--pr');
      continue;
    }

    if (token === '--interval') {
      intervalSeconds = parsePositiveInteger(readFlagValue(tokens, index, '--interval'), '--interval');
      index += 1;
      continue;
    }

    if (token.startsWith('--interval=')) {
      intervalSeconds = parsePositiveInteger(token.slice('--interval='.length), '--interval');
      continue;
    }

    if (token === '--timeout') {
      timeoutSeconds = parsePositiveInteger(readFlagValue(tokens, index, '--timeout'), '--timeout');
      index += 1;
      continue;
    }

    if (token.startsWith('--timeout=')) {
      timeoutSeconds = parsePositiveInteger(token.slice('--timeout='.length), '--timeout');
      continue;
    }

    if (token.startsWith('--')) {
      throw new CodeflowPrChecksError({
        code: 'invalid_arguments',
        message: `Unknown /flow-watch option: ${token}`,
        details: { option: token },
      });
    }

    throw new CodeflowPrChecksError({
      code: 'invalid_arguments',
      message: `/flow-watch only accepts flags; unexpected argument: ${token}`,
      details: { argument: token },
    });
  }

  return {
    dryRun,
    ...(pr === undefined ? {} : { pr }),
    ...(requiredOnly === undefined ? {} : { requiredOnly }),
    ...(watch === undefined ? {} : { watch }),
    ...(failFast === undefined ? {} : { failFast }),
    ...(intervalSeconds === undefined ? {} : { intervalSeconds }),
    ...(timeoutSeconds === undefined ? {} : { timeoutSeconds }),
  };
}

export function formatFlowWatchResult(result: FlowWatchResult): string {
  const lines = [
    'Codeflow GitHub checks result.',
    '',
    `Status: ${result.checks.status}`,
    `PR: ${result.checks.prNumber === null ? 'unknown' : `#${result.checks.prNumber}`}`,
    `Mode: ${result.checks.requiredOnly ? 'required checks' : 'all checks'}`,
    `Watched: ${result.checks.watched ? 'yes' : 'no'}`,
    `Lifecycle phase: ${result.lifecyclePhase}`,
    '',
    result.checks.summary,
    '',
    'Next expected actions:',
    ...result.nextExpectedActions.map((action) => `- ${action}`),
  ];

  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:', ...result.warnings.map((warning) => `- ${warning}`));
  }

  return lines.join('\n');
}

function resolveTargetPrOption(
  explicitPr: number | string | undefined,
  sessionState: CodeflowSessionState,
): number | string | undefined {
  if (explicitPr !== undefined) {
    return explicitPr;
  }

  return sessionState.pullRequests.lastPullRequest?.number;
}

function getLifecyclePhaseForChecks(result: CodeflowPrChecksResult): CodeflowLifecyclePhase {
  if (result.status === 'passed' || result.status === 'skipped') {
    return 'verified';
  }

  if (result.status === 'failed' || result.status === 'unknown') {
    return 'blocked';
  }

  return 'ci_waiting';
}

function getFlowWatchNextExpectedActions(result: CodeflowPrChecksResult): string[] {
  if (result.status === 'passed') {
    return [
      'Review PR comments, then continue with the review-comment loop when available.',
      'Do not merge, approve, resolve comments, or delete branches from /flow-watch.',
    ];
  }

  if (result.status === 'failed') {
    return [
      'Inspect failed check logs in GitHub using the details links.',
      'Fix the issue, run /flow-check, commit the fix, push to the PR branch, then run /flow-watch again.',
    ];
  }

  if (result.status === 'pending') {
    return [
      result.requiredOnly
        ? 'Run /flow-watch --required again or wait for required checks to complete.'
        : 'Run /flow-watch --all again or wait for checks to complete.',
      'Do not rerun workflows unless a maintainer explicitly scopes that action.',
    ];
  }

  if (result.status === 'no_checks') {
    return [
      'Do not claim remote verification from an empty GitHub checks list.',
      'Confirm check configuration or wait for GitHub checks to appear, then run /flow-watch again.',
    ];
  }

  if (result.status === 'skipped') {
    return [
      'Confirm skipped checks are expected before treating remote verification as satisfied.',
      'Continue to review-comment triage only when skipped checks are acceptable for this PR.',
    ];
  }

  return [
    'Inspect GitHub check status manually because Codeflow could not normalize it safely.',
    'Rerun /flow-watch after GitHub returns a recognized checks status.',
  ];
}

function makeDryRunResult(options: {
  pr: number | string | undefined;
  requiredOnly: boolean;
  watch: boolean;
  failFast: boolean;
  intervalSeconds: number;
  timeoutSeconds: number;
  sessionState: CodeflowSessionState;
}): CodeflowPrChecksResult {
  const timestamp = new Date().toISOString();
  const prNumber = typeof options.pr === 'number' ? options.pr : null;
  const prUrl = prNumber === null
    ? options.sessionState.pullRequests.lastPullRequest?.url ?? null
    : options.sessionState.pullRequests.lastPullRequest?.number === prNumber
      ? options.sessionState.pullRequests.lastPullRequest.url
      : null;
  const warnings = [
    'Dry run requested; GitHub PR checks were not read.',
    ...(options.pr === undefined
      ? ['No explicit or stored PR number was available for the dry-run plan.']
      : []),
  ];
  const plannedSummary = [
    'GitHub checks watch dry-run.',
    '',
    `PR: ${prNumber === null ? 'unknown' : `#${prNumber}`}`,
    `Mode: ${options.requiredOnly ? 'required checks' : 'all checks'}`,
    `Watch: ${options.watch ? 'yes' : 'no'}`,
    `Fail fast: ${options.failFast ? 'yes' : 'no'}`,
    `Interval: ${options.intervalSeconds}s`,
    `Timeout: ${options.timeoutSeconds}s`,
    '',
    'Next expected action:',
    'Run `/flow-watch` without `--dry-run` when ready to read GitHub checks.',
  ].join('\n');

  return {
    status: 'unknown',
    prNumber,
    prUrl,
    baseBranch: options.sessionState.pullRequests.lastPullRequest?.baseBranch ?? null,
    headBranch: options.sessionState.pullRequests.lastPullRequest?.headBranch ?? null,
    headSha: null,
    requiredOnly: options.requiredOnly,
    watched: options.watch,
    startedAt: timestamp,
    finishedAt: timestamp,
    durationMs: 0,
    checks: [],
    failedChecks: [],
    pendingChecks: [],
    passedChecks: [],
    skippedChecks: [],
    summary: plannedSummary,
    warnings,
  };
}

function validateFlowWatchTiming(intervalSeconds: number, timeoutSeconds: number): void {
  parsePositiveInteger(String(intervalSeconds), 'intervalSeconds');
  parsePositiveInteger(String(timeoutSeconds), 'timeoutSeconds');
}

function validateRequiredMode(current: boolean | undefined, token: string): void {
  if (current === undefined) {
    return;
  }

  throw new CodeflowPrChecksError({
    code: 'invalid_arguments',
    message: `Choose either --required or --all, not both. Conflicting option: ${token}`,
    details: { option: token },
  });
}

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new CodeflowPrChecksError({
      code: 'invalid_arguments',
      message: `${flagName} requires a positive integer value.`,
      details: { flagName, value },
    });
  }

  return parsed;
}

function readFlagValue(tokens: string[], index: number, flagName: string): string {
  const value = tokens[index + 1];

  if (!value || value.startsWith('--')) {
    throw new CodeflowPrChecksError({
      code: 'invalid_arguments',
      message: `${flagName} requires a value.`,
      details: { flagName },
    });
  }

  return value;
}

function splitCommandArguments(args: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const character of args) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (escaping) {
    current += '\\';
  }

  if (quote) {
    throw new CodeflowPrChecksError({
      code: 'invalid_arguments',
      message: 'Unterminated quote in /flow-watch arguments.',
    });
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
