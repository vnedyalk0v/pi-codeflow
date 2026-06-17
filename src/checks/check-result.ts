export type { CodeflowCheckConfig } from '../config/codeflow-config';

export type CodeflowCheckStatus = 'passed' | 'failed' | 'skipped' | 'timed_out';

export interface CodeflowCheckResult {
  name: string;
  command: string;
  status: CodeflowCheckStatus;
  exitCode: number | null;
  signal: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stdout: string;
  stderr: string;
  summary: string;
  required: boolean;
}

export type CodeflowCheckRunStatus = 'passed' | 'failed' | 'skipped' | 'no_checks';

export interface CodeflowCheckRunResult {
  status: CodeflowCheckRunStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  results: CodeflowCheckResult[];
  summary: string;
  failedCheckNames: string[];
  passedCheckNames: string[];
  skippedCheckNames: string[];
}
