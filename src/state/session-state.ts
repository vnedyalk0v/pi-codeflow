import type { CodeflowCheckRunResult } from '../checks/check-result';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import {
  createInitialLifecycleState,
  type CodeflowLifecycleState,
} from '../lifecycle/lifecycle-state';
import { nowIso } from '../utils/time';
import {
  createInitialCheckState,
  updateCheckStateWithRun,
  type CodeflowCheckState,
} from './check-state';

export interface CodeflowSessionState {
  lifecycle: CodeflowLifecycleState;
  checks: CodeflowCheckState;
  updatedAt: string;
}

export interface CreateCodeflowSessionStateOptions {
  phase?: CodeflowLifecyclePhase;
  task?: string;
  baseBranch?: string;
  workBranch?: string | null;
}

export function createCodeflowSessionState(
  options: CreateCodeflowSessionStateOptions = {},
): CodeflowSessionState {
  return {
    lifecycle: createInitialLifecycleState(options),
    checks: createInitialCheckState(),
    updatedAt: nowIso(),
  };
}

export function updateSessionStateWithCheckRun(
  state: CodeflowSessionState,
  run: CodeflowCheckRunResult,
  phase: CodeflowLifecyclePhase,
): CodeflowSessionState {
  return {
    ...state,
    lifecycle: {
      ...state.lifecycle,
      phase,
    },
    checks: updateCheckStateWithRun(state.checks, run),
    updatedAt: nowIso(),
  };
}
