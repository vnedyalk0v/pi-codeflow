import { describe, expect, it } from 'vitest';

import type { GhClientLike } from '../../src/github/gh-client';
import { GithubCliError } from '../../src/github/github-errors';
import {
  buildGetPrChecksArgs,
  buildWatchPrChecksArgs,
  getGitHubPrChecks,
  watchGitHubPrChecks,
} from '../../src/github/pr-checks-client';

function viewJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    number: 123,
    url: 'https://github.com/org/repo/pull/123',
    baseRefName: 'dev',
    headRefName: 'feat/checks',
    headRefOid: 'a'.repeat(40),
    ...overrides,
  });
}

function ghClient(calls: string[][], outputs: Array<string | Error>): GhClientLike {
  return {
    run: async (args) => {
      calls.push(args);
      const next = outputs.shift();

      if (next instanceof Error) {
        throw next;
      }

      return {
        args,
        stdout: next ?? '[]',
        stderr: '',
      };
    },
  };
}

describe('GitHub PR checks client args', () => {
  it('builds gh pr checks args for explicit PR, required-only, and all modes', () => {
    expect(buildGetPrChecksArgs(123, true)).toEqual([
      'pr',
      'checks',
      '123',
      '--required',
      '--json',
      'bucket,completedAt,description,event,link,name,startedAt,state,workflow',
    ]);
    expect(buildGetPrChecksArgs(123, false)).not.toContain('--required');
  });

  it('builds documented gh watch args with interval and fail-fast without using gh run list', () => {
    const args = buildWatchPrChecksArgs({
      pr: 123,
      requiredOnly: true,
      failFast: true,
      intervalSeconds: 10,
    });

    expect(args).toEqual([
      'pr',
      'checks',
      '123',
      '--required',
      '--watch',
      '--fail-fast',
      '--interval',
      '10',
    ]);
    expect(args).not.toEqual(expect.arrayContaining(['run', 'list']));
  });
});

describe('getGitHubPrChecks', () => {
  it('fetches PR metadata and checks through gh pr checks', async () => {
    const calls: string[][] = [];
    const result = await getGitHubPrChecks({
      pr: 123,
      requiredOnly: true,
      ghClient: ghClient(calls, [
        viewJson(),
        JSON.stringify([{ name: 'build', bucket: 'pass', state: 'SUCCESS' }]),
      ]),
    });

    expect(result.status).toBe('passed');
    expect(result.prNumber).toBe(123);
    expect(calls[0]).toEqual(['pr', 'view', '123', '--json', 'number,url,baseRefName,headRefName,headRefOid']);
    expect(calls[1]).toEqual(expect.arrayContaining(['pr', 'checks', '123', '--required']));
    expect(calls.flat()).not.toEqual(expect.arrayContaining(['run', 'list']));
  });

  it('handles gh exit code 8 as pending when stdout contains check rows', async () => {
    const calls: string[][] = [];
    const pendingError = new GithubCliError({
      code: 'gh_command_failed',
      message: 'checks pending',
      args: ['pr', 'checks', '123'],
      exitCode: 8,
      stdout: JSON.stringify([{ name: 'test', bucket: 'pending', state: 'IN_PROGRESS' }]),
    });
    const result = await getGitHubPrChecks({
      pr: 123,
      ghClient: ghClient(calls, [viewJson(), pendingError]),
    });

    expect(result.status).toBe('pending');
    expect(result.warnings.join('\n')).toContain('pending checks');
  });

  it('parses failed check rows when gh exits non-zero with JSON stdout', async () => {
    const calls: string[][] = [];
    const failedError = new GithubCliError({
      code: 'gh_command_failed',
      message: 'checks failed',
      args: ['pr', 'checks', '123', '--json', 'bucket,state,name'],
      exitCode: 1,
      stdout: JSON.stringify([
        {
          name: 'test',
          workflow: 'CI',
          bucket: 'fail',
          state: 'FAILURE',
          link: 'https://github.com/org/repo/actions/runs/1',
        },
      ]),
    });
    const result = await getGitHubPrChecks({
      pr: 123,
      ghClient: ghClient(calls, [viewJson(), failedError]),
    });

    expect(result.status).toBe('failed');
    expect(result.failedChecks).toHaveLength(1);
    expect(result.summary).toContain('GitHub checks failed.');
    expect(result.summary).toContain('Details: https://github.com/org/repo/actions/runs/1');
  });

  it('treats no required checks messages as no_checks', async () => {
    const calls: string[][] = [];
    const noRequiredChecksError = new GithubCliError({
      code: 'gh_command_failed',
      message: 'no required checks reported on the current branch',
      args: ['pr', 'checks', '123', '--required'],
      exitCode: 1,
      stderr: 'no required checks reported on the current branch',
    });
    const result = await getGitHubPrChecks({
      pr: 123,
      requiredOnly: true,
      ghClient: ghClient(calls, [viewJson(), noRequiredChecksError]),
    });

    expect(result.status).toBe('no_checks');
    expect(result.warnings.join('\n')).toContain('No GitHub PR checks were found');
  });

  it('handles missing gh, auth failure, and no PR found with Codeflow errors', async () => {
    await expect(
      getGitHubPrChecks({
        pr: 123,
        ghClient: ghClient([], [
          new GithubCliError({ code: 'gh_missing', message: 'gh missing', args: ['pr', 'view'] }),
        ]),
      }),
    ).rejects.toMatchObject({ code: 'gh_missing' });

    await expect(
      getGitHubPrChecks({
        pr: 123,
        ghClient: ghClient([], [
          new GithubCliError({ code: 'gh_auth_required', message: 'auth', args: ['pr', 'view'] }),
        ]),
      }),
    ).rejects.toMatchObject({ code: 'gh_auth_required' });

    await expect(
      getGitHubPrChecks({
        ghClient: ghClient([], [
          new GithubCliError({
            code: 'gh_command_failed',
            message: 'no pull requests found for branch',
            args: ['pr', 'view'],
            stderr: 'no pull requests found for branch',
          }),
        ]),
      }),
    ).rejects.toMatchObject({ code: 'no_pr_found' });
  });
});

describe('watchGitHubPrChecks', () => {
  it('polls until checks pass', async () => {
    const calls: string[][] = [];
    const result = await watchGitHubPrChecks({
      pr: 123,
      intervalSeconds: 1,
      timeoutSeconds: 30,
      sleep: async () => undefined,
      ghClient: ghClient(calls, [
        viewJson(),
        JSON.stringify([{ name: 'test', bucket: 'pending', state: 'IN_PROGRESS' }]),
        viewJson(),
        JSON.stringify([{ name: 'test', bucket: 'pass', state: 'SUCCESS' }]),
      ]),
    });

    expect(result.status).toBe('passed');
    expect(result.attempts).toBe(2);
    expect(calls.filter((args) => args[0] === 'pr' && args[1] === 'checks')).toHaveLength(2);
  });

  it('keeps polling no-checks samples until checks appear', async () => {
    const calls: string[][] = [];
    const result = await watchGitHubPrChecks({
      pr: 123,
      intervalSeconds: 1,
      timeoutSeconds: 30,
      sleep: async () => undefined,
      ghClient: ghClient(calls, [
        viewJson(),
        JSON.stringify([]),
        viewJson(),
        JSON.stringify([{ name: 'test', bucket: 'pass', state: 'SUCCESS' }]),
      ]),
    });

    expect(result.status).toBe('passed');
    expect(result.attempts).toBe(2);
    expect(calls.filter((args) => args[0] === 'pr' && args[1] === 'checks')).toHaveLength(2);
  });

  it('stops watching immediately when an unknown check is mixed with pending checks', async () => {
    const calls: string[][] = [];
    const result = await watchGitHubPrChecks({
      pr: 123,
      intervalSeconds: 1,
      timeoutSeconds: 30,
      sleep: async () => undefined,
      ghClient: ghClient(calls, [
        viewJson(),
        JSON.stringify([
          { name: 'future-check', bucket: 'new', state: 'ODD' },
          { name: 'test', bucket: 'pending', state: 'IN_PROGRESS' },
        ]),
      ]),
    });

    expect(result.status).toBe('unknown');
    expect(result.attempts).toBe(1);
    expect(calls.filter((args) => args[0] === 'pr' && args[1] === 'checks')).toHaveLength(1);
  });

  it('does not start another poll after the watch deadline', async () => {
    const calls: string[][] = [];
    let index = 0;
    const times = [0, 0, 500, 1000];
    const result = await watchGitHubPrChecks({
      pr: 123,
      intervalSeconds: 1,
      timeoutSeconds: 1,
      nowMs: () => times[index++] ?? 1000,
      sleep: async () => undefined,
      ghClient: ghClient(calls, [
        viewJson(),
        JSON.stringify([{ name: 'test', bucket: 'pending', state: 'IN_PROGRESS' }]),
        viewJson(),
        JSON.stringify([{ name: 'test', bucket: 'pass', state: 'SUCCESS' }]),
      ]),
    });

    expect(result.status).toBe('pending');
    expect(result.timedOut).toBe(true);
    expect(result.attempts).toBe(1);
    expect(calls.filter((args) => args[0] === 'pr' && args[1] === 'checks')).toHaveLength(1);
  });

  it('returns pending with a timeout warning when polling exceeds the bound', async () => {
    const calls: string[][] = [];
    let index = 0;
    const times = [0, 2000, 3000];
    const result = await watchGitHubPrChecks({
      pr: 123,
      intervalSeconds: 1,
      timeoutSeconds: 1,
      nowMs: () => times[index++] ?? 3000,
      sleep: async () => undefined,
      ghClient: ghClient(calls, [
        viewJson(),
        JSON.stringify([{ name: 'test', bucket: 'pending', state: 'IN_PROGRESS' }]),
      ]),
    });

    expect(result.status).toBe('pending');
    expect(result.timedOut).toBe(true);
    expect(result.summary).toContain('timed out');
  });
});
