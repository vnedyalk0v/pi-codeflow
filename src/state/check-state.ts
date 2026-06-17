import type { CodeflowCheckRunResult, CodeflowCheckRunStatus } from '../checks/check-result';
import { truncateForSummary } from '../checks/check-summary';

const MAX_STORED_SUMMARY_CHARS = 500;
const MAX_STORED_COMMAND_CHARS = 500;

export interface CodeflowStoredCheckResult {
  name: string;
  command: string;
  status: string;
  exitCode: number | null;
  durationMs: number;
  summary: string;
}

export interface CodeflowStoredCheckRun {
  status: CodeflowCheckRunStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  results: CodeflowStoredCheckResult[];
}

export interface CodeflowCheckState {
  lastRun: CodeflowStoredCheckRun | null;
}

export function createInitialCheckState(): CodeflowCheckState {
  return {
    lastRun: null,
  };
}

export function updateCheckStateWithRun(
  state: CodeflowCheckState,
  run: CodeflowCheckRunResult,
): CodeflowCheckState {
  return {
    ...state,
    lastRun: toStoredCheckRun(run),
  };
}

export function toStoredCheckRun(run: CodeflowCheckRunResult): CodeflowStoredCheckRun {
  return {
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    results: run.results.map((result) => ({
      name: result.name,
      command: truncateForSummary(result.command, MAX_STORED_COMMAND_CHARS),
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      summary: truncateForSummary(result.summary, MAX_STORED_SUMMARY_CHARS),
    })),
  };
}
