import { describe, expect, it } from 'vitest';

import { createGitHubPullRequest } from '../../src/index';
import { buildCreatePullRequestArgs } from '../../src/github/pr-client';
import type { GhClientLike } from '../../src/github/gh-client';
import { GithubCliError } from '../../src/github/github-errors';

function ghClient(run: GhClientLike['run']): GhClientLike {
  return { run };
}

describe('createGitHubPullRequest', () => {
  it('builds expected gh pr create args without --fill', () => {
    const args = buildCreatePullRequestArgs({
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr',
      title: 'feat: add flow pr',
      bodyFilePath: '/tmp/body.md',
      draft: true,
    });

    expect(args).toEqual([
      'pr',
      'create',
      '--base',
      'dev',
      '--head',
      'feat/flow-pr',
      '--title',
      'feat: add flow pr',
      '--body-file',
      '/tmp/body.md',
      '--draft',
    ]);
    expect(args).not.toContain('--fill');
  });

  it('passes explicit base, head, title, body-file, and draft to gh', async () => {
    const calls: string[][] = [];
    const result = await createGitHubPullRequest({
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr',
      title: 'feat: add flow pr',
      body: '## Summary\n\nBody',
      draft: true,
      ghClient: ghClient(async (args) => {
        calls.push(args);
        return {
          args,
          stdout: 'https://github.com/vnedyalk0v/pi-codeflow/pull/12\n',
          stderr: '',
        };
      }),
    });

    expect(calls[0]).toEqual(
      expect.arrayContaining(['--base', 'dev', '--head', 'feat/flow-pr', '--title', 'feat: add flow pr', '--body-file']),
    );
    expect(calls[0]).toContain('--draft');
    expect(calls[0]).not.toContain('--fill');
    expect(result.url).toBe('https://github.com/vnedyalk0v/pi-codeflow/pull/12');
    expect(result.number).toBe(12);
  });

  it('accepts GitHub Enterprise pull request URLs from gh output', async () => {
    const result = await createGitHubPullRequest({
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr',
      title: 'feat: add flow pr',
      body: '## Summary\n\nBody',
      ghClient: ghClient(async (args) => ({
        args,
        stdout: 'https://github.company.com/org/repo/pull/12\n',
        stderr: '',
      })),
    });

    expect(result.url).toBe('https://github.company.com/org/repo/pull/12');
    expect(result.number).toBe(12);
  });

  it('extracts PR numbers from trailing-slash PR URLs', async () => {
    const result = await createGitHubPullRequest({
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr',
      title: 'feat: add flow pr',
      body: '## Summary\n\nBody',
      ghClient: ghClient(async (args) => ({
        args,
        stdout: 'https://github.company.com/org/repo/pull/12/\n',
        stderr: '',
      })),
    });

    expect(result.url).toBe('https://github.company.com/org/repo/pull/12/');
    expect(result.number).toBe(12);
  });

  it('handles missing gh and auth failures clearly', async () => {
    await expect(
      createGitHubPullRequest({
        baseBranch: 'dev',
        headBranch: 'feat/flow-pr',
        title: 'feat: add flow pr',
        body: 'body',
        ghClient: ghClient(async (args) => {
          throw new GithubCliError({
            code: 'gh_missing',
            message: 'gh missing',
            args,
          });
        }),
      }),
    ).rejects.toMatchObject({ code: 'gh_missing' });

    await expect(
      createGitHubPullRequest({
        baseBranch: 'dev',
        headBranch: 'feat/flow-pr',
        title: 'feat: add flow pr',
        body: 'body',
        ghClient: ghClient(async (args) => {
          throw new GithubCliError({
            code: 'gh_auth_required',
            message: 'auth required',
            args,
          });
        }),
      }),
    ).rejects.toMatchObject({ code: 'gh_auth_required' });
  });

  it('returns and updates an existing PR when configured', async () => {
    const calls: string[][] = [];
    const result = await createGitHubPullRequest({
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr',
      title: 'feat: add flow pr',
      body: 'body',
      updateExisting: true,
      ghClient: ghClient(async (args) => {
        calls.push(args);

        if (args[0] === 'pr' && args[1] === 'create') {
          throw new GithubCliError({
            code: 'gh_command_failed',
            message: 'a pull request already exists for this branch',
            args,
            stderr: 'a pull request already exists for this branch',
          });
        }

        if (args[0] === 'pr' && args[1] === 'list') {
          return {
            args,
            stdout: JSON.stringify([
              {
                url: 'https://github.com/vnedyalk0v/pi-codeflow/pull/33',
                number: 33,
                baseRefName: 'dev',
                headRefName: 'feat/flow-pr',
                title: 'old title',
                isDraft: false,
              },
            ]),
            stderr: '',
          };
        }

        return { args, stdout: '', stderr: '' };
      }),
    });

    expect(result.created).toBe(false);
    expect(result.updatedExisting).toBe(true);
    expect(result.url).toBe('https://github.com/vnedyalk0v/pi-codeflow/pull/33');
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(['pr', 'list', '--head', 'feat/flow-pr', '--limit', '1']),
      ]),
    );
    expect(calls.some((args) => args[0] === 'pr' && args[1] === 'view')).toBe(false);
    expect(calls.some((args) => args[0] === 'pr' && args[1] === 'edit')).toBe(true);
  });

  it('retargets existing PRs to the requested base branch', async () => {
    const calls: string[][] = [];
    const result = await createGitHubPullRequest({
      baseBranch: 'main',
      headBranch: 'feat/flow-pr',
      title: 'feat: add flow pr',
      body: 'body',
      updateExisting: true,
      ghClient: ghClient(async (args) => {
        calls.push(args);

        if (args[0] === 'pr' && args[1] === 'create') {
          throw new GithubCliError({
            code: 'gh_command_failed',
            message: 'a pull request already exists for this branch',
            args,
            stderr: 'a pull request already exists for this branch',
          });
        }

        if (args[0] === 'pr' && args[1] === 'list') {
          return {
            args,
            stdout: JSON.stringify([
              {
                url: 'https://github.com/vnedyalk0v/pi-codeflow/pull/33',
                number: 33,
                baseRefName: 'dev',
                headRefName: 'feat/flow-pr',
                isDraft: false,
              },
            ]),
            stderr: '',
          };
        }

        return { args, stdout: '', stderr: '' };
      }),
    });

    expect(result.baseBranch).toBe('main');
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(['pr', 'edit', 'https://github.com/vnedyalk0v/pi-codeflow/pull/33', '--base', 'main']),
      ]),
    );
  });

  it('applies ready and draft overrides when updating existing PRs', async () => {
    const readyCalls: string[][] = [];
    const readyResult = await createGitHubPullRequest({
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr',
      title: 'feat: add flow pr',
      body: 'body',
      draft: true,
      draftOverride: false,
      updateExisting: true,
      ghClient: ghClient(async (args) => {
        readyCalls.push(args);

        if (args[0] === 'pr' && args[1] === 'create') {
          throw new GithubCliError({
            code: 'gh_command_failed',
            message: 'a pull request already exists for this branch',
            args,
            stderr: 'a pull request already exists for this branch',
          });
        }

        if (args[0] === 'pr' && args[1] === 'list') {
          return {
            args,
            stdout: JSON.stringify([
              {
                url: 'https://github.com/vnedyalk0v/pi-codeflow/pull/33',
                number: 33,
                baseRefName: 'dev',
                headRefName: 'feat/flow-pr',
                isDraft: true,
              },
            ]),
            stderr: '',
          };
        }

        return { args, stdout: '', stderr: '' };
      }),
    });

    expect(readyResult.draft).toBe(false);
    expect(readyCalls).toEqual(
      expect.arrayContaining([
        ['pr', 'ready', 'https://github.com/vnedyalk0v/pi-codeflow/pull/33'],
      ]),
    );

    const draftCalls: string[][] = [];
    const draftResult = await createGitHubPullRequest({
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr',
      title: 'feat: add flow pr',
      body: 'body',
      draft: false,
      draftOverride: true,
      updateExisting: true,
      ghClient: ghClient(async (args) => {
        draftCalls.push(args);

        if (args[0] === 'pr' && args[1] === 'create') {
          throw new GithubCliError({
            code: 'gh_command_failed',
            message: 'a pull request already exists for this branch',
            args,
            stderr: 'a pull request already exists for this branch',
          });
        }

        if (args[0] === 'pr' && args[1] === 'list') {
          return {
            args,
            stdout: JSON.stringify([
              {
                url: 'https://github.com/vnedyalk0v/pi-codeflow/pull/34',
                number: 34,
                baseRefName: 'dev',
                headRefName: 'feat/flow-pr',
                isDraft: false,
              },
            ]),
            stderr: '',
          };
        }

        return { args, stdout: '', stderr: '' };
      }),
    });

    expect(draftResult.draft).toBe(true);
    expect(draftCalls).toEqual(
      expect.arrayContaining([
        ['pr', 'ready', 'https://github.com/vnedyalk0v/pi-codeflow/pull/34', '--undo'],
      ]),
    );
  });

  it('does not apply the configured default draft state when updating existing PRs', async () => {
    const calls: string[][] = [];
    const result = await createGitHubPullRequest({
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr',
      title: 'feat: add flow pr',
      body: 'body',
      draft: true,
      updateExisting: true,
      ghClient: ghClient(async (args) => {
        calls.push(args);

        if (args[0] === 'pr' && args[1] === 'create') {
          throw new GithubCliError({
            code: 'gh_command_failed',
            message: 'a pull request already exists for this branch',
            args,
            stderr: 'a pull request already exists for this branch',
          });
        }

        if (args[0] === 'pr' && args[1] === 'list') {
          return {
            args,
            stdout: JSON.stringify([
              {
                url: 'https://github.com/vnedyalk0v/pi-codeflow/pull/35',
                number: 35,
                baseRefName: 'dev',
                headRefName: 'feat/flow-pr',
                isDraft: false,
              },
            ]),
            stderr: '',
          };
        }

        return { args, stdout: '', stderr: '' };
      }),
    });

    expect(result.draft).toBe(false);
    expect(calls.some((args) => args[0] === 'pr' && args[1] === 'ready')).toBe(false);
  });

  it('includes GitHub Enterprise URLs in existing PR errors when updates are disabled', async () => {
    await expect(
      createGitHubPullRequest({
        baseBranch: 'dev',
        headBranch: 'feat/flow-pr',
        title: 'feat: add flow pr',
        body: 'body',
        updateExisting: false,
        ghClient: ghClient(async (args) => {
          throw new GithubCliError({
            code: 'gh_command_failed',
            message: 'a pull request already exists: https://github.company.com/org/repo/pull/33',
            args,
            stderr: 'a pull request already exists: https://github.company.com/org/repo/pull/33',
          });
        }),
      }),
    ).rejects.toMatchObject({
      code: 'pr_already_exists',
      message: 'A pull request already exists for feat/flow-pr: https://github.company.com/org/repo/pull/33',
      details: { existingUrl: 'https://github.company.com/org/repo/pull/33' },
    });
  });

  it('returns a clear error for existing PRs when updates are disabled', async () => {
    await expect(
      createGitHubPullRequest({
        baseBranch: 'dev',
        headBranch: 'feat/flow-pr',
        title: 'feat: add flow pr',
        body: 'body',
        updateExisting: false,
        ghClient: ghClient(async (args) => {
          throw new GithubCliError({
            code: 'gh_command_failed',
            message: 'a pull request already exists: https://github.com/vnedyalk0v/pi-codeflow/pull/33',
            args,
            stderr: 'a pull request already exists: https://github.com/vnedyalk0v/pi-codeflow/pull/33',
          });
        }),
      }),
    ).rejects.toMatchObject({ code: 'pr_already_exists' });
  });
});
