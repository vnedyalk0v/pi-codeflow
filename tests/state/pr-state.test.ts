import { describe, expect, it } from 'vitest';

import {
  createInitialPrState,
  updatePrStateWithPullRequest,
} from '../../src/state/pr-state';
import {
  createCodeflowSessionState,
  updateSessionStateWithPullRequest,
} from '../../src/state/session-state';

describe('Codeflow PR state', () => {
  it('stores bounded latest PR metadata', () => {
    const state = updatePrStateWithPullRequest(createInitialPrState(), {
      number: 12,
      url: 'https://github.com/vnedyalk0v/pi-codeflow/pull/12',
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr-generated-title-body',
      title: 'feat(pull-requests): implement flow-pr generated title body',
      draft: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(state.lastPullRequest).toEqual({
      number: 12,
      url: 'https://github.com/vnedyalk0v/pi-codeflow/pull/12',
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr-generated-title-body',
      title: 'feat(pull-requests): implement flow-pr generated title body',
      draft: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(JSON.stringify(state)).not.toContain('## Summary');
  });

  it('updates session lifecycle to pr_opened after a successful PR', () => {
    const session = createCodeflowSessionState({ phase: 'committed' });
    const updated = updateSessionStateWithPullRequest(session, {
      number: 12,
      url: 'https://github.com/vnedyalk0v/pi-codeflow/pull/12',
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr-generated-title-body',
      title: 'feat(pull-requests): implement flow-pr generated title body',
      draft: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(updated.lifecycle.phase).toBe('pr_opened');
    expect(updated.pullRequests.lastPullRequest?.number).toBe(12);
    expect(updated.checks).toBe(session.checks);
    expect(updated.commits).toBe(session.commits);
  });
});
