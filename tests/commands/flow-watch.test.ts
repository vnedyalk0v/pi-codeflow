import { describe, expect, it } from 'vitest';

import {
  CodeflowPrChecksError,
  getDefaultCodeflowConfig,
  parseFlowWatchArguments,
  runFlowWatch,
  type FlowWatchResult,
} from '../../src/index';
import { registerCodeflowExtension } from '../../src/extension';
import type { GhClientLike } from '../../src/github/gh-client';
import { createCodeflowSessionState } from '../../src/state/session-state';

function viewJson(number = 123) {
  return JSON.stringify({
    number,
    url: `https://github.com/org/repo/pull/${number}`,
    baseRefName: 'dev',
    headRefName: 'feat/checks',
    headRefOid: 'a'.repeat(40),
  });
}

function ghClient(calls: string[][], checksRows: unknown[]): GhClientLike {
  return {
    run: async (args) => {
      calls.push(args);

      if (args[0] === 'pr' && args[1] === 'view') {
        return { args, stdout: viewJson(Number(args[2] ?? 123)), stderr: '' };
      }

      if (args[0] === 'pr' && args[1] === 'checks') {
        return { args, stdout: JSON.stringify(checksRows), stderr: '' };
      }

      throw new Error(`unexpected gh args: ${args.join(' ')}`);
    },
  };
}

function sessionWithPr(number = 123) {
  const session = createCodeflowSessionState({ phase: 'pr_opened' });
  session.pullRequests.lastPullRequest = {
    number,
    url: `https://github.com/org/repo/pull/${number}`,
    baseBranch: 'dev',
    headBranch: 'feat/checks',
    title: 'feat: checks',
    draft: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  return session;
}

describe('parseFlowWatchArguments', () => {
  it('parses PR, required/all, fail-fast, interval, timeout, and dry-run flags', () => {
    expect(parseFlowWatchArguments('--pr 123 --required --fail-fast --interval 10 --timeout 600 --dry-run')).toEqual({
      dryRun: true,
      pr: 123,
      requiredOnly: true,
      failFast: true,
      intervalSeconds: 10,
      timeoutSeconds: 600,
    });
    expect(parseFlowWatchArguments('--all --once')).toEqual({
      dryRun: false,
      requiredOnly: false,
      watch: false,
    });
  });

  it('rejects conflicting modes, unknown flags, and freeform arguments', () => {
    expect(() => parseFlowWatchArguments('--required --all')).toThrow(CodeflowPrChecksError);
    expect(() => parseFlowWatchArguments('--merge')).toThrow(CodeflowPrChecksError);
    expect(() => parseFlowWatchArguments('gh pr merge')).toThrow(CodeflowPrChecksError);
  });
});

describe('runFlowWatch', () => {
  it('supports dry-run without calling GitHub or transitioning to verified', async () => {
    const calls: string[][] = [];
    const result = await runFlowWatch({
      dryRun: true,
      pr: 123,
      config: getDefaultCodeflowConfig(),
      ghClient: { run: async (args) => { calls.push(args); throw new Error('unexpected'); } },
      sessionState: sessionWithPr(123),
    });

    expect(result.checks.summary).toContain('dry-run');
    expect(result.lifecyclePhase).not.toBe('verified');
    expect(calls).toEqual([]);
  });

  it('uses latest PR state when no explicit PR is provided', async () => {
    const calls: string[][] = [];
    const result = await runFlowWatch({
      watch: false,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient(calls, [{ name: 'build', bucket: 'pass', state: 'SUCCESS' }]),
      sessionState: sessionWithPr(456),
    });

    expect(result.checks.prNumber).toBe(456);
    expect(calls[0]).toEqual(['pr', 'view', '456', '--json', 'number,url,baseRefName,headRefName,headRefOid']);
  });

  it('moves pending checks to ci_waiting and stores latest GitHub checks state', async () => {
    const result = await runFlowWatch({
      watch: false,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [{ name: 'test', bucket: 'pending', state: 'IN_PROGRESS' }]),
      sessionState: sessionWithPr(),
    });

    expect(result.checks.status).toBe('pending');
    expect(result.lifecyclePhase).toBe('ci_waiting');
    expect(result.sessionState.githubChecks?.lastRun?.status).toBe('pending');
  });

  it('moves passing checks to verified', async () => {
    const result = await runFlowWatch({
      watch: false,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [{ name: 'build', bucket: 'pass', state: 'SUCCESS' }]),
      sessionState: sessionWithPr(),
    });

    expect(result.checks.status).toBe('passed');
    expect(result.lifecyclePhase).toBe('verified');
    expect(result.sessionState.lifecycle.phase).toBe('verified');
  });

  it('moves failing required checks to blocked with failure context', async () => {
    const result = await runFlowWatch({
      watch: false,
      requiredOnly: true,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [
        {
          name: 'test',
          workflow: 'CI',
          bucket: 'fail',
          state: 'FAILURE',
          link: 'https://github.com/org/repo/actions/runs/1',
        },
      ]),
      sessionState: sessionWithPr(),
    });

    expect(result.checks.status).toBe('failed');
    expect(result.lifecyclePhase).toBe('blocked');
    expect(result.checks.summary).toContain('Details: https://github.com/org/repo/actions/runs/1');
  });

  it('keeps no checks from claiming verified', async () => {
    const result = await runFlowWatch({
      watch: false,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], []),
      sessionState: sessionWithPr(),
    });

    expect(result.checks.status).toBe('no_checks');
    expect(result.lifecyclePhase).toBe('ci_waiting');
    expect(result.sessionState.lifecycle.phase).not.toBe('verified');
  });

  it('does not merge, approve, push, rerun workflows, resolve comments, or delete branches', async () => {
    const calls: string[][] = [];
    await runFlowWatch({
      watch: false,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient(calls, [{ name: 'build', bucket: 'pass', state: 'SUCCESS' }]),
      sessionState: sessionWithPr(),
    });

    const flat = calls.flat();
    expect(flat).not.toEqual(expect.arrayContaining(['merge', 'review', 'push', 'rerun']));
    expect(flat).not.toEqual(expect.arrayContaining(['comment', 'resolve', 'delete-branch']));
    expect(calls.every((args) => args[0] === 'pr' && ['view', 'checks'].includes(args[1] ?? ''))).toBe(true);
  });
});

describe('/flow-watch command registration', () => {
  it('registers the command and passes parsed flags with session state', async () => {
    const notifications: Array<{ message: string; level: string }> = [];
    const handlers = new Map<string, (args: string, context: { cwd: string; ui: { notify: (message: string, level: 'info' | 'warning' | 'error') => void } }) => Promise<unknown>>();
    let receivedOptions: unknown;

    registerCodeflowExtension(
      {
        on() {},
        registerCommand(name, options) {
          handlers.set(name, options.handler);
        },
      },
      {
        runFlowWatch: async (options = {}) => {
          receivedOptions = options;
          return {
            checks: {
              status: 'passed',
              prNumber: options.pr as number,
              prUrl: 'https://github.com/org/repo/pull/123',
              baseBranch: 'dev',
              headBranch: 'feat/checks',
              headSha: 'a'.repeat(40),
              requiredOnly: options.requiredOnly ?? true,
              watched: options.watch ?? true,
              startedAt: '2026-01-01T00:00:00.000Z',
              finishedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 1000,
              checks: [],
              failedChecks: [],
              pendingChecks: [],
              passedChecks: [],
              skippedChecks: [],
              summary: 'GitHub checks passed.',
              warnings: [],
            },
            lifecyclePhase: 'verified',
            nextExpectedActions: ['Review PR comments when available.'],
            warnings: [],
            sessionState: createCodeflowSessionState({ phase: 'verified' }),
          } satisfies FlowWatchResult;
        },
      },
    );

    const result = await handlers.get('flow-watch')?.('--pr 123 --required --fail-fast --interval 10 --timeout 600', {
      cwd: '/tmp/project',
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    }) as FlowWatchResult;

    expect(result.lifecyclePhase).toBe('verified');
    expect(receivedOptions).toMatchObject({
      cwd: '/tmp/project',
      pr: 123,
      requiredOnly: true,
      failFast: true,
      intervalSeconds: 10,
      timeoutSeconds: 600,
    });
    expect(notifications[0]?.message).toContain('Codeflow GitHub checks result.');
  });
});
