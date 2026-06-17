import { execConfiguredCommand } from '../utils/exec-command';
import { elapsedMs, nowIso } from '../utils/time';
import { resolveCheckCommand } from './check-command';
import {
  getCheckNamesByStatus,
  getCheckRunStatus,
  shouldStopAfterCheckResult,
} from './check-policy';
import type {
  CodeflowCheckConfig,
  CodeflowCheckResult,
  CodeflowCheckRunResult,
} from './check-result';
import {
  summarizeCheckResults,
  summarizeSingleCheckResult,
} from './check-summary';

export interface RunCodeflowChecksOptions {
  cwd?: string;
  checks?: CodeflowCheckConfig[];
  stopOnFailure?: boolean;
  dryRun?: boolean;
  env?: Record<string, string>;
}

export async function runCodeflowChecks(
  options: RunCodeflowChecksOptions = {},
): Promise<CodeflowCheckRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const checks = options.checks ?? [];
  const stopOnFailure = options.stopOnFailure ?? true;
  const runStartedAtMs = Date.now();
  const runStartedAt = nowIso();
  const results: CodeflowCheckResult[] = [];

  if (checks.length === 0) {
    return finalizeCheckRun({
      startedAt: runStartedAt,
      startedAtMs: runStartedAtMs,
      results,
      statusOverride: 'no_checks',
    });
  }

  if (options.dryRun) {
    for (const check of checks) {
      const resolved = resolveCheckCommand(check, cwd);
      results.push(createSkippedCheckResult(resolved, 'Dry run; command was not executed.'));
    }

    return finalizeCheckRun({
      startedAt: runStartedAt,
      startedAtMs: runStartedAtMs,
      results,
      statusOverride: 'skipped',
    });
  }

  for (let index = 0; index < checks.length; index += 1) {
    const resolved = resolveCheckCommand(checks[index], cwd);
    const checkResult = await runSingleCheck(resolved, options.env);
    results.push(checkResult);

    if (shouldStopAfterCheckResult(checkResult, stopOnFailure)) {
      for (const skippedCheck of checks.slice(index + 1)) {
        const skipped = resolveCheckCommand(skippedCheck, cwd);
        results.push(
          createSkippedCheckResult(
            skipped,
            `Skipped because ${checkResult.name} failed and stopOnFailure is enabled.`,
          ),
        );
      }
      break;
    }
  }

  return finalizeCheckRun({
    startedAt: runStartedAt,
    startedAtMs: runStartedAtMs,
    results,
  });
}

type ResolvedCheck = ReturnType<typeof resolveCheckCommand>;

async function runSingleCheck(
  check: ResolvedCheck,
  env?: Record<string, string>,
): Promise<CodeflowCheckResult> {
  const startedAtMs = Date.now();
  const startedAt = nowIso();
  const commandResult = await execConfiguredCommand(check.command, {
    cwd: check.cwd,
    env,
    timeoutMs: check.timeoutMs,
  });
  const finishedAtMs = Date.now();
  const finishedAt = nowIso();
  const durationMs = elapsedMs(startedAtMs, finishedAtMs);
  const status = commandResult.timedOut
    ? 'timed_out'
    : commandResult.exitCode === 0
      ? 'passed'
      : 'failed';
  const result: CodeflowCheckResult = {
    name: check.name,
    command: check.command,
    status,
    exitCode: commandResult.exitCode,
    signal: commandResult.signal,
    startedAt,
    finishedAt,
    durationMs,
    stdout: commandResult.stdout,
    stderr: commandResult.stderr,
    summary: '',
    required: check.required,
  };

  return {
    ...result,
    summary: summarizeSingleCheckResult(result),
  };
}

function createSkippedCheckResult(
  check: ResolvedCheck,
  reason: string,
): CodeflowCheckResult {
  const timestamp = nowIso();
  const result: CodeflowCheckResult = {
    name: check.name,
    command: check.command,
    status: 'skipped',
    exitCode: null,
    signal: null,
    startedAt: timestamp,
    finishedAt: timestamp,
    durationMs: 0,
    stdout: '',
    stderr: '',
    summary: reason,
    required: check.required,
  };

  return result;
}

function finalizeCheckRun(options: {
  startedAt: string;
  startedAtMs: number;
  results: CodeflowCheckResult[];
  statusOverride?: CodeflowCheckRunResult['status'];
}): CodeflowCheckRunResult {
  const finishedAtMs = Date.now();
  const finishedAt = nowIso();
  const status = options.statusOverride ?? getCheckRunStatus(options.results);
  const names = getCheckNamesByStatus(options.results);
  const run: CodeflowCheckRunResult = {
    status,
    startedAt: options.startedAt,
    finishedAt,
    durationMs: elapsedMs(options.startedAtMs, finishedAtMs),
    results: options.results,
    summary: '',
    ...names,
  };

  return {
    ...run,
    summary: summarizeCheckResults(run),
  };
}
