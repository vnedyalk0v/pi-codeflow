import { describe, expect, it } from 'vitest';

import type { CodeflowCommitPayload } from '../../src/index';
import {
  createInitialCommitState,
  updateCommitStateWithCommit,
} from '../../src/state/commit-state';
import {
  createCodeflowSessionState,
  updateSessionStateWithCommit,
} from '../../src/state/session-state';

function payload(): CodeflowCommitPayload {
  return {
    type: 'feat',
    scope: 'commits',
    summary: 'store commit metadata',
    context: 'Long context should not be persisted in commit state.'.repeat(20),
    changes: ['Large change body should not persist.'.repeat(20)],
    verification: ['npm test'],
    risk: 'Low.'.repeat(20),
    refs: ['#11'],
  };
}

describe('Codeflow commit state', () => {
  it('stores bounded latest commit metadata', () => {
    const state = updateCommitStateWithCommit(createInitialCommitState(), {
      sha: 'a'.repeat(40),
      branch: 'feat/flow-commit-generated-messages',
      title: 'feat(commits): store commit metadata',
      payload: payload(),
      committedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(state.lastCommit).toEqual({
      sha: 'a'.repeat(40),
      branch: 'feat/flow-commit-generated-messages',
      title: 'feat(commits): store commit metadata',
      type: 'feat',
      scope: 'commits',
      summary: 'store commit metadata',
      refs: ['#11'],
      committedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(JSON.stringify(state)).not.toContain('Long context should not be persisted');
    expect(JSON.stringify(state)).not.toContain('Large change body should not persist');
  });

  it('updates session lifecycle to committed after a successful commit', () => {
    const session = createCodeflowSessionState({ phase: 'ready_to_commit' });
    const updated = updateSessionStateWithCommit(session, {
      sha: 'b'.repeat(40),
      branch: 'feat/flow-commit-generated-messages',
      title: 'feat(commits): store commit metadata',
      payload: payload(),
      committedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(updated.lifecycle.phase).toBe('committed');
    expect(updated.commits.lastCommit?.sha).toBe('b'.repeat(40));
    expect(updated.checks).toBe(session.checks);
  });
});
