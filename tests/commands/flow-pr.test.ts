import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CodeflowPrError,
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  parseFlowPrArguments,
  readFlowPrPayloadFile,
  runFlowPr,
  type CodeflowPrPayload,
  type FlowPrResult,
} from '../../src/index';
import { registerCodeflowExtension } from '../../src/extension';
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
      changes: ['Added command behavior.'],
      verification: ['npm test'],
      selfReview: ['No merge automation was added.'],
      risk: 'Medium.',
      rollback: 'Revert the PR.',
      refs: ['#12'],
    },
    ...overrides,
  };
}

function state(status: 'passed' | 'failed' | 'no_checks' | null = 'passed') {
  const session = createCodeflowSessionState({ phase: 'committed' });
  if (status) {
    session.checks.lastRun = {
      status,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1000,
      results: [],
    };
  }
  session.commits.lastCommit = {
    sha: 'a'.repeat(40),
    branch: 'feat/flow-pr-generated-title-body',
    title: 'feat(pull-requests): implement flow-pr generated title body',
    type: 'feat',
    scope: 'pull-requests',
    summary: 'implement flow-pr generated title body',
    refs: ['#12'],
    committedAt: '2026-01-01T00:00:00.000Z',
  };
  return session;
}

function gitClient(overrides: Partial<GitClient> = {}): GitClient {
  return {
    getCurrentBranch: async () => 'feat/flow-pr-generated-title-body',
    getStatus: async () => ({ clean: true, raw: '', entries: [] }),
    remoteBranchExists: async () => true,
    remoteHeadExists: async () => true,
    branchExists: async (branchName: string) => branchName === 'dev' || branchName === 'main',
    getAheadCount: async () => 1,
    pushBranch: async () => undefined,
    ...overrides,
  } as unknown as GitClient;
}

function ghClient(calls: string[][] = []): GhClientLike {
  return {
    run: async (args) => {
      calls.push(args);
      return {
        args,
        stdout: 'https://github.com/vnedyalk0v/pi-codeflow/pull/12\n',
        stderr: '',
      };
    },
  };
}

describe('parseFlowPrArguments', () => {
  it('parses payload, dry-run, draft, ready, and base flags', () => {
    expect(parseFlowPrArguments('--dry-run --draft --base dev --payload .pi/codeflow/pr.json')).toEqual({
      dryRun: true,
      draft: true,
      allowUnverified: false,
      allowReservedHead: false,
      payloadPath: '.pi/codeflow/pr.json',
      baseBranch: 'dev',
    });
    expect(parseFlowPrArguments('--ready --head feat/x --no-push --payload pr.json')).toEqual({
      dryRun: false,
      draft: false,
      allowUnverified: false,
      allowReservedHead: false,
      push: false,
      payloadPath: 'pr.json',
      headBranch: 'feat/x',
    });
  });

  it('rejects unsupported flags and freeform arguments', () => {
    expect(() => parseFlowPrArguments('--fill')).toThrow(CodeflowPrError);
    expect(() => parseFlowPrArguments('gh pr create')).toThrow(CodeflowPrError);
  });
});

describe('readFlowPrPayloadFile', () => {
  it('reads structured payload JSON from a path', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'codeflow-pr-payload-'));
    const payloadPath = path.join(dir, 'pr-payload.json');
    await writeFile(payloadPath, JSON.stringify(payload()), 'utf8');

    await expect(readFlowPrPayloadFile(payloadPath)).resolves.toMatchObject({
      title: { summary: 'implement generated pull requests' },
    });
  });

  it('returns a clear error for invalid payload JSON', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'codeflow-pr-payload-'));
    const payloadPath = path.join(dir, 'pr-payload.json');
    await writeFile(payloadPath, '{', 'utf8');

    await expect(readFlowPrPayloadFile(payloadPath)).rejects.toMatchObject({
      code: 'invalid_payload_json',
    });
  });
});

describe('runFlowPr', () => {
  it('dry-run returns rendered title/body and does not call GitHub or store a created PR', async () => {
    const calls: string[][] = [];
    const result = await runFlowPr({
      payload: payload(),
      dryRun: true,
      gitClient: gitClient(),
      ghClient: ghClient(calls),
      sessionState: state(),
    });

    expect(result.status).toBe('dry_run');
    expect(result.prUrl).toBeNull();
    expect(result.title).toBe('feat(pull-requests): implement generated pull requests');
    expect(result.body).toContain('Refs #12');
    expect(result.sessionState.lifecycle.phase).toBe('committed');
    expect(result.sessionState.pullRequests.lastPullRequest).toBeNull();
    expect(calls).toEqual([]);
  });

  it('returns a clear error for invalid payloads', async () => {
    await expect(
      runFlowPr({
        payload: payload({ body: { ...payload().body, changes: [] } }),
        dryRun: true,
        gitClient: gitClient(),
        sessionState: state(),
      }),
    ).rejects.toMatchObject({ code: 'invalid_payload' });
  });

  it('defaults base from config, explicit base overrides config, and head defaults to current branch', async () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      pullRequest: { baseBranch: 'develop' },
      baseBranches: { allowed: ['dev', 'develop', 'main'] },
    } as Record<string, unknown>);
    const configured = await runFlowPr({
      payload: payload(),
      dryRun: true,
      config,
      gitClient: gitClient(),
      sessionState: state(),
    });
    const explicit = await runFlowPr({
      payload: payload(),
      dryRun: true,
      baseBranch: 'main',
      config,
      gitClient: gitClient(),
      sessionState: state(),
    });

    expect(configured.baseBranch).toBe('develop');
    expect(explicit.baseBranch).toBe('main');
    expect(configured.headBranch).toBe('feat/flow-pr-generated-title-body');
  });

  it('refuses reserved head branches and base=head', async () => {
    await expect(
      runFlowPr({
        payload: payload({ headBranch: 'dev', baseBranch: 'main' }),
        dryRun: true,
        gitClient: gitClient({ getCurrentBranch: async () => 'dev' }),
        sessionState: state(),
      }),
    ).rejects.toMatchObject({ code: 'reserved_branch' });

    await expect(
      runFlowPr({
        payload: payload({ baseBranch: 'dev', headBranch: 'dev' }),
        dryRun: true,
        gitClient: gitClient({ getCurrentBranch: async () => 'dev' }),
        sessionState: state(),
      }),
    ).rejects.toMatchObject({ code: 'base_equals_head' });
  });

  it('failed checks block by default and allowUnverified permits PR with warning', async () => {
    await expect(
      runFlowPr({
        payload: payload(),
        gitClient: gitClient(),
        ghClient: ghClient(),
        sessionState: state('failed'),
      }),
    ).rejects.toMatchObject({ code: 'checks_failed' });

    const result = await runFlowPr({
      payload: payload(),
      dryRun: true,
      allowUnverified: true,
      gitClient: gitClient(),
      sessionState: state('failed'),
    });

    expect(result.warnings.join('\n')).toContain('Latest /flow-check state failed');
  });

  it('warns for missing commit state but does not block', async () => {
    const session = state();
    session.commits.lastCommit = null;
    const result = await runFlowPr({
      payload: payload(),
      dryRun: true,
      gitClient: gitClient(),
      sessionState: session,
    });

    expect(result.warnings.join('\n')).toContain('No latest /flow-commit state found');
  });

  it('creates a PR, stores metadata, and does not commit, merge, delete branches, or resolve comments', async () => {
    const calls: string[][] = [];
    const pushed: string[] = [];
    const result = await runFlowPr({
      payload: payload(),
      gitClient: gitClient({ pushBranch: async (branchName: string) => { pushed.push(branchName); } }),
      ghClient: ghClient(calls),
      sessionState: state(),
    });

    expect(result.status).toBe('created');
    expect(result.prUrl).toBe('https://github.com/vnedyalk0v/pi-codeflow/pull/12');
    expect(result.sessionState.lifecycle.phase).toBe('pr_opened');
    expect(result.sessionState.pullRequests.lastPullRequest).toMatchObject({
      number: 12,
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr-generated-title-body',
    });
    expect(pushed).toEqual(['feat/flow-pr-generated-title-body']);
    expect(calls.flat()).not.toEqual(expect.arrayContaining(['merge', 'review', 'delete-branch']));
  });
});

describe('/flow-pr command registration', () => {
  it('registers the command and reads payload path before dry-run', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'codeflow-flow-pr-'));
    await writeFile(path.join(dir, 'pr-payload.json'), JSON.stringify(payload()), 'utf8');
    const notifications: Array<{ message: string; level: string }> = [];
    const handlers = new Map<string, (args: string, context: { cwd: string; ui: { notify: (message: string, level: 'info' | 'warning' | 'error') => void } }) => Promise<unknown>>();

    registerCodeflowExtension(
      {
        on() {},
        registerCommand(name, options) {
          handlers.set(name, options.handler);
        },
      },
      {
        runFlowPr: async (options) =>
          ({
            status: 'dry_run',
            prUrl: null,
            prNumber: null,
            baseBranch: options.baseBranch ?? 'dev',
            headBranch: 'feat/flow-pr-generated-title-body',
            title: 'feat(pull-requests): implement generated pull requests',
            body: '## Summary\n\nImplemented /flow-pr.',
            payload: options.payload,
            warnings: [],
            validationWarnings: [],
            lifecyclePhase: 'committed',
            draft: true,
            updatedExisting: false,
            nextExpectedActions: ['Review the rendered PR title and body preview.'],
            sessionState: createCodeflowSessionState({ phase: 'committed' }),
          }) satisfies FlowPrResult,
      },
    );

    const result = await handlers.get('flow-pr')?.('--dry-run --payload pr-payload.json', {
      cwd: dir,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    }) as FlowPrResult;

    expect(result.status).toBe('dry_run');
    expect(notifications[0]?.level).toBe('info');
    expect(notifications[0]?.message).toContain('Codeflow PR dry-run.');
    expect(notifications[0]?.message).toContain('Rendered PR body:');
  });

  it('surfaces invalid payload errors', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'codeflow-flow-pr-'));
    await writeFile(path.join(dir, 'bad-payload.json'), JSON.stringify({ title: 'bad' }), 'utf8');
    const notifications: Array<{ message: string; level: string }> = [];
    const handlers = new Map<string, (args: string, context: { cwd: string; ui: { notify: (message: string, level: 'info' | 'warning' | 'error') => void } }) => Promise<unknown>>();

    registerCodeflowExtension({
      on() {},
      registerCommand(name, options) {
        handlers.set(name, options.handler);
      },
    });

    await expect(
      handlers.get('flow-pr')?.('--dry-run --payload bad-payload.json', {
        cwd: dir,
        ui: {
          notify(message, level) {
            notifications.push({ message, level });
          },
        },
      }),
    ).rejects.toThrow(CodeflowPrError);

    expect(notifications[0]).toEqual({
      level: 'error',
      message: '/flow-pr failed: PR payload failed validation.',
    });
  });
});
