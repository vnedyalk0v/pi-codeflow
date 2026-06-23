import { describe, expect, it } from 'vitest';

import {
  createInitialLifecycleState,
  getDefaultCodeflowConfig,
  getNextExpectedActions,
  mergeCodeflowConfig,
  type CodeflowLifecyclePhase,
} from '../../src/index';
import { getExpectedToolsForPhase } from '../../src/lifecycle/lifecycle-transitions';

function actionsFor(phase: CodeflowLifecyclePhase) {
  return getNextExpectedActions(
    createInitialLifecycleState({
      phase,
      baseBranch: 'dev',
      workBranch: 'feat/guidance-injection',
    }),
    getDefaultCodeflowConfig(),
  );
}

describe('getNextExpectedActions', () => {
  it('returns expected actions for idle', () => {
    expect(actionsFor('idle').join('\n')).toContain('/flow-start');
  });

  it('returns expected actions for initialized', () => {
    const actions = actionsFor('initialized').join('\n');

    expect(actions).toContain('base branch dev');
    expect(actions).toContain('/flow-start');
  });

  it('returns expected actions for branch_prepared', () => {
    const actions = actionsFor('branch_prepared').join('\n');

    expect(actions).toContain('feat/guidance-injection');
    expect(actions).toContain('structured plan');
  });

  it('returns configured check actions for local_checks', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      checks: [{ name: 'unit tests', command: 'npm test' }],
    });
    const actions = getNextExpectedActions(
      createInitialLifecycleState({ phase: 'local_checks' }),
      config,
    ).join('\n');

    expect(actions).toContain('/flow-check');
    expect(actions).toContain('unit tests');
  });

  it('returns expected actions for ready_to_commit', () => {
    const actions = actionsFor('ready_to_commit').join('\n');

    expect(actions).toContain('structured commit payload');
    expect(actions).toContain('templates/commit-message.md');
  });

  it('returns expected actions for pr_opened', () => {
    const actions = actionsFor('pr_opened').join('\n');

    expect(actions).toContain('/flow-watch');
    expect(actions).toContain('/flow-comments');
  });

  it('returns expected actions for blocked', () => {
    const actions = actionsFor('blocked').join('\n');

    expect(actions).toContain('Stop workflow-changing operations');
    expect(actions).toContain('human decision');
  });

  it('returns expected actions for emergency', () => {
    const actions = actionsFor('emergency').join('\n');

    expect(actions).toContain('emergency reason');
    expect(actions).toContain('structured commit and PR payloads');
    expect(actions).toContain('final report');
  });

  it('returns only implemented extension commands as expected tools', () => {
    const config = getDefaultCodeflowConfig();

    expect(getExpectedToolsForPhase('branch_prepared', config)).toEqual(['/flow-start']);
    expect(getExpectedToolsForPhase('self_review', config)).toEqual([]);
    expect(getExpectedToolsForPhase('verified', config)).toEqual([]);
    expect(getExpectedToolsForPhase('blocked', config)).toEqual([]);
  });
});
