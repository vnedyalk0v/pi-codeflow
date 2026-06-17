import { describe, expect, it } from 'vitest';

import {
  createInitialLifecycleState,
  type CodeflowLifecyclePhase,
} from '../../src/index';
import { CODEFLOW_LIFECYCLE_PHASES } from '../../src/lifecycle/lifecycle-phase';

describe('createInitialLifecycleState', () => {
  it('defaults to idle phase', () => {
    expect(createInitialLifecycleState()).toEqual({
      phase: 'idle',
      workBranch: null,
    });
  });

  it('preserves a provided phase and metadata', () => {
    expect(
      createInitialLifecycleState({
        phase: 'planning',
        task: 'Implement guidance',
        baseBranch: 'dev',
        workBranch: 'feat/guidance-injection',
      }),
    ).toEqual({
      phase: 'planning',
      task: 'Implement guidance',
      baseBranch: 'dev',
      workBranch: 'feat/guidance-injection',
    });
  });

  it.each(CODEFLOW_LIFECYCLE_PHASES)('accepts known phase %s', (phase) => {
    expect(createInitialLifecycleState({ phase }).phase).toBe(phase);
  });

  it('rejects an unknown phase at runtime', () => {
    expect(() =>
      createInitialLifecycleState({ phase: 'unknown' as CodeflowLifecyclePhase }),
    ).toThrow('Unknown Codeflow lifecycle phase');
  });
});
