import {
  assertCodeflowLifecyclePhase,
  type CodeflowLifecyclePhase,
} from './lifecycle-phase';

export interface CodeflowLifecycleState {
  phase: CodeflowLifecyclePhase;
  task?: string;
  baseBranch?: string;
  workBranch: string | null;
}

export interface CreateInitialLifecycleStateOptions {
  phase?: CodeflowLifecyclePhase;
  task?: string;
  baseBranch?: string;
  workBranch?: string | null;
}

export function createInitialLifecycleState(
  options: CreateInitialLifecycleStateOptions = {},
): CodeflowLifecycleState {
  const phase =
    options.phase === undefined ? 'idle' : assertCodeflowLifecyclePhase(options.phase);

  return {
    phase,
    ...(options.task === undefined ? {} : { task: options.task }),
    ...(options.baseBranch === undefined ? {} : { baseBranch: options.baseBranch }),
    workBranch: options.workBranch ?? null,
  };
}
