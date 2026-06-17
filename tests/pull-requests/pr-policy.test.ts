import { describe, expect, it } from 'vitest';

import {
  createCodeflowPullRequestFromPayload,
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  type CodeflowPrPayload,
} from '../../src/index';
import type { GitClient } from '../../src/git/git-client';
import type { GhClientLike } from '../../src/github/gh-client';
import { createCodeflowSessionState } from '../../src/state/session-state';

function payload(overrides: Partial<CodeflowPrPayload> = {}): CodeflowPrPayload {
  return {
    title: {
      type: 'feat',
      scope: 'pull-requests',
      summary: 'implement generated pull requests',
    },
    body: {
      summary: 'Implemented /flow-pr.',
      context: 'Codeflow needs deterministic PRs.',
      changes: ['Added PR policy.'],
      verification: ['npm test'],
      selfReview: ['No CI watcher was added.'],
      risk: 'Medium.',
      rollback: 'Revert the PR.',
      refs: ['#12'],
    },
    ...overrides,
  };
}

function passedState() {
  const state = createCodeflowSessionState({ phase: 'committed' });
  state.checks.lastRun = {
    status: 'passed',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1000,
    results: [],
  };
  state.commits.lastCommit = {
    sha: 'a'.repeat(40),
    branch: 'feat/flow-pr-generated-title-body',
    title: 'feat(pull-requests): implement flow-pr generated title body',
    type: 'feat',
    scope: 'pull-requests',
    summary: 'implement flow-pr generated title body',
    refs: ['#12'],
    committedAt: '2026-01-01T00:00:00.000Z',
  };
  return state;
}

function gitClient(overrides: Partial<GitClient> = {}): GitClient {
  return {
    getCurrentBranch: async () => 'feat/flow-pr-generated-title-body',
    getStatus: async () => ({ clean: true, raw: '', entries: [] }),
    remoteBranchExists: async () => true,
    remoteHeadExists: async () => true,
    branchExists: async (branchName: string) => branchName === 'dev',
    getAheadCount: async () => 1,
    pushBranch: async () => undefined,
    ...overrides,
  } as unknown as GitClient;
}

function ghClient(): GhClientLike {
  return {
    run: async (args) => {
      expect(args).not.toContain('--fill');
      return {
        args,
        stdout: 'https://github.com/vnedyalk0v/pi-codeflow/pull/42\n',
        stderr: '',
      };
    },
  };
}

describe('createCodeflowPullRequestFromPayload policy', () => {
  it('refuses reserved head branches', async () => {
    await expect(
      createCodeflowPullRequestFromPayload({
        payload: payload({ headBranch: 'dev', baseBranch: 'main' }),
        dryRun: true,
        gitClient: gitClient({ getCurrentBranch: async () => 'dev' }),
        sessionState: passedState(),
      }),
    ).rejects.toMatchObject({ code: 'reserved_branch' });
  });

  it('refuses base=head', async () => {
    await expect(
      createCodeflowPullRequestFromPayload({
        payload: payload({ baseBranch: 'dev', headBranch: 'dev' }),
        dryRun: true,
        gitClient: gitClient({ getCurrentBranch: async () => 'dev' }),
        sessionState: passedState(),
      }),
    ).rejects.toMatchObject({ code: 'base_equals_head' });
  });

  it('blocks failed checks by default and allows them with an explicit override', async () => {
    const failedState = passedState();
    failedState.checks.lastRun = {
      status: 'failed',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1000,
      results: [],
    };

    await expect(
      createCodeflowPullRequestFromPayload({
        payload: payload(),
        gitClient: gitClient(),
        ghClient: ghClient(),
        sessionState: failedState,
      }),
    ).rejects.toMatchObject({ code: 'checks_failed' });

    const allowed = await createCodeflowPullRequestFromPayload({
      payload: payload(),
      dryRun: true,
      allowUnverified: true,
      gitClient: gitClient(),
      sessionState: failedState,
    });

    expect(allowed.status).toBe('dry_run');
    expect(allowed.warnings.join('\n')).toContain('Latest /flow-check state failed');
  });

  it('warns when commit state is missing but does not block by default', async () => {
    const state = passedState();
    state.commits.lastCommit = null;
    const result = await createCodeflowPullRequestFromPayload({
      payload: payload(),
      dryRun: true,
      gitClient: gitClient(),
      sessionState: state,
    });

    expect(result.warnings.join('\n')).toContain('No latest /flow-commit state found');
  });

  it('uses configured base branch and explicit base override', async () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      pullRequest: { baseBranch: 'develop' },
      baseBranches: { allowed: ['dev', 'develop', 'main'] },
    } as Record<string, unknown>);
    const configured = await createCodeflowPullRequestFromPayload({
      payload: payload(),
      dryRun: true,
      config,
      gitClient: gitClient(),
      sessionState: passedState(),
    });
    const explicit = await createCodeflowPullRequestFromPayload({
      payload: payload(),
      dryRun: true,
      baseBranch: 'main',
      config,
      gitClient: gitClient(),
      sessionState: passedState(),
    });

    expect(configured.baseBranch).toBe('develop');
    expect(explicit.baseBranch).toBe('main');
  });

  it('dry-run renders title/body and does not call GitHub', async () => {
    let called = false;
    const result = await createCodeflowPullRequestFromPayload({
      payload: payload(),
      dryRun: true,
      gitClient: gitClient(),
      ghClient: { run: async () => { called = true; throw new Error('unexpected'); } },
      sessionState: passedState(),
    });

    expect(result.status).toBe('dry_run');
    expect(result.title).toBe('feat(pull-requests): implement generated pull requests');
    expect(result.body).toContain('## Summary');
    expect(called).toBe(false);
  });

  it('pushes the current feature branch and creates a PR in normal mode', async () => {
    const pushed: string[] = [];
    const result = await createCodeflowPullRequestFromPayload({
      payload: payload(),
      gitClient: gitClient({ pushBranch: async (branchName: string) => { pushed.push(branchName); } }),
      ghClient: ghClient(),
      sessionState: passedState(),
    });

    expect(result.status).toBe('created');
    expect(result.prUrl).toBe('https://github.com/vnedyalk0v/pi-codeflow/pull/42');
    expect(pushed).toEqual(['feat/flow-pr-generated-title-body']);
  });
});
