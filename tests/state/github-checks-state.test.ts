import { describe, expect, it } from 'vitest';

import type { CodeflowPrCheck, CodeflowPrChecksResult } from '../../src/index';
import {
  createInitialGitHubChecksState,
  updateGitHubChecksStateWithResult,
} from '../../src/state/github-checks-state';
import {
  createCodeflowSessionState,
  updateSessionStateWithGitHubChecks,
} from '../../src/state/session-state';

function check(status: CodeflowPrCheck['status']): CodeflowPrCheck {
  return {
    name: 'test',
    workflow: 'CI',
    status,
    rawState: status,
    bucket: status === 'pending' ? 'pending' : status === 'passed' ? 'pass' : 'fail',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: status === 'pending' ? null : '2026-01-01T00:01:00.000Z',
    durationMs: 60000,
    description: 'large description should not persist in state',
    detailsUrl: 'https://github.com/org/repo/actions/runs/1',
    required: true,
  };
}

function result(status: CodeflowPrChecksResult['status']): CodeflowPrChecksResult {
  const checks = status === 'no_checks' ? [] : [check(status === 'passed' ? 'passed' : status === 'pending' ? 'pending' : 'failed')];

  return {
    status,
    prNumber: 123,
    prUrl: 'https://github.com/org/repo/pull/123',
    baseBranch: 'dev',
    headBranch: 'feat/checks',
    headSha: 'a'.repeat(40),
    requiredOnly: true,
    watched: true,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:00.000Z',
    durationMs: 60000,
    checks,
    failedChecks: checks.filter((item) => item.status === 'failed'),
    pendingChecks: checks.filter((item) => item.status === 'pending'),
    passedChecks: checks.filter((item) => item.status === 'passed'),
    skippedChecks: [],
    summary: 'summary '.repeat(500),
    warnings: [],
  };
}

describe('Codeflow GitHub checks state', () => {
  it.each(['passed', 'failed', 'pending', 'no_checks'] as const)('stores latest %s GitHub checks state', (status) => {
    const state = updateGitHubChecksStateWithResult(createInitialGitHubChecksState(), result(status));

    expect(state.lastRun?.status).toBe(status);
    expect(state.lastRun?.prNumber).toBe(123);
    expect(state.lastRun?.checks[0]?.detailsUrl).toBe(status === 'no_checks' ? undefined : 'https://github.com/org/repo/actions/runs/1');
    expect(JSON.stringify(state)).not.toContain('large description should not persist');
    expect(state.lastRun?.summary.length ?? 0).toBeLessThanOrEqual(2000);
  });

  it('updates session lifecycle with latest GitHub checks result', () => {
    const session = createCodeflowSessionState({ phase: 'ci_waiting' });
    const updated = updateSessionStateWithGitHubChecks(session, result('passed'), 'verified');

    expect(updated.lifecycle.phase).toBe('verified');
    expect(updated.githubChecks?.lastRun?.status).toBe('passed');
    expect(updated.checks).toBe(session.checks);
    expect(updated.commits).toBe(session.commits);
    expect(updated.pullRequests).toBe(session.pullRequests);
  });
});
