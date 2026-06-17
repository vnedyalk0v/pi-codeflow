import type {
  CodeflowCheckResult,
  CodeflowCheckRunStatus,
} from './check-result';

export function isFailedCheckStatus(status: CodeflowCheckResult['status']): boolean {
  return status === 'failed' || status === 'timed_out';
}

export function shouldStopAfterCheckResult(
  result: CodeflowCheckResult,
  stopOnFailure: boolean,
): boolean {
  return stopOnFailure && result.required && isFailedCheckStatus(result.status);
}

export function getCheckRunStatus(results: CodeflowCheckResult[]): CodeflowCheckRunStatus {
  if (results.length === 0) {
    return 'no_checks';
  }

  if (results.every((result) => result.status === 'skipped')) {
    return 'skipped';
  }

  if (
    results.some(
      (result) => result.required && isFailedCheckStatus(result.status),
    )
  ) {
    return 'failed';
  }

  return 'passed';
}

export function getCheckNamesByStatus(
  results: CodeflowCheckResult[],
): {
  failedCheckNames: string[];
  passedCheckNames: string[];
  skippedCheckNames: string[];
} {
  return {
    failedCheckNames: results
      .filter((result) => isFailedCheckStatus(result.status))
      .map((result) => result.name),
    passedCheckNames: results
      .filter((result) => result.status === 'passed')
      .map((result) => result.name),
    skippedCheckNames: results
      .filter((result) => result.status === 'skipped')
      .map((result) => result.name),
  };
}
