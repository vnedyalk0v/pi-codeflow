import type {
  CodeflowPrCheck,
  CodeflowPrChecksAggregateStatus,
  CodeflowPrCheckStatus,
} from './pr-checks-parser';

export function isPassedPrCheckStatus(status: CodeflowPrCheckStatus): boolean {
  return status === 'passed' || status === 'neutral';
}

export function isFailedPrCheckStatus(status: CodeflowPrCheckStatus): boolean {
  return status === 'failed' || status === 'timed_out' || status === 'cancelled';
}

export function isPendingPrCheckStatus(status: CodeflowPrCheckStatus): boolean {
  return status === 'pending';
}

export function isSkippedPrCheckStatus(status: CodeflowPrCheckStatus): boolean {
  return status === 'skipped';
}

export function getPrChecksAggregateStatus(
  checks: CodeflowPrCheck[],
): CodeflowPrChecksAggregateStatus {
  if (checks.length === 0) {
    return 'no_checks';
  }

  if (checks.some((check) => isFailedPrCheckStatus(check.status))) {
    return 'failed';
  }

  if (checks.some((check) => check.status === 'unknown')) {
    return 'unknown';
  }

  if (checks.some((check) => isPendingPrCheckStatus(check.status))) {
    return 'pending';
  }

  if (checks.every((check) => isSkippedPrCheckStatus(check.status))) {
    return 'skipped';
  }

  if (checks.every((check) => isPassedPrCheckStatus(check.status) || isSkippedPrCheckStatus(check.status))) {
    return 'passed';
  }

  return 'unknown';
}

export function getChecksByStatus(checks: CodeflowPrCheck[]): {
  failedChecks: CodeflowPrCheck[];
  pendingChecks: CodeflowPrCheck[];
  passedChecks: CodeflowPrCheck[];
  skippedChecks: CodeflowPrCheck[];
} {
  return {
    failedChecks: checks.filter((check) => isFailedPrCheckStatus(check.status)),
    pendingChecks: checks.filter((check) => isPendingPrCheckStatus(check.status)),
    passedChecks: checks.filter((check) => isPassedPrCheckStatus(check.status)),
    skippedChecks: checks.filter((check) => isSkippedPrCheckStatus(check.status)),
  };
}
