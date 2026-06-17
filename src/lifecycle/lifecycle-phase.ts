export const CODEFLOW_LIFECYCLE_PHASES = [
  'idle',
  'initialized',
  'branch_prepared',
  'planning',
  'implementing',
  'local_checks',
  'self_review',
  'fixing_local_findings',
  'ready_to_commit',
  'committed',
  'pr_opened',
  'ci_waiting',
  'review_triage',
  'fixing_review_findings',
  'verified',
  'final_reported',
  'blocked',
  'emergency',
] as const;

export type CodeflowLifecyclePhase = (typeof CODEFLOW_LIFECYCLE_PHASES)[number];

const CODEFLOW_LIFECYCLE_PHASE_SET = new Set<string>(CODEFLOW_LIFECYCLE_PHASES);

export function isCodeflowLifecyclePhase(
  value: unknown,
): value is CodeflowLifecyclePhase {
  return typeof value === 'string' && CODEFLOW_LIFECYCLE_PHASE_SET.has(value);
}

export function assertCodeflowLifecyclePhase(
  value: unknown,
): CodeflowLifecyclePhase {
  if (!isCodeflowLifecyclePhase(value)) {
    throw new TypeError(`Unknown Codeflow lifecycle phase: ${String(value)}`);
  }

  return value;
}
