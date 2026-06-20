import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { GhClientLike } from '../../src/github/gh-client';
import { GithubCliError } from '../../src/github/github-errors';
import { listGitHubReviewThreads, CodeflowReviewCommentsError } from '../../src/index';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function fixture(name: string): string {
  return readFileSync(path.join(repoRoot, 'tests/fixtures/github', name), 'utf8');
}

function prView(number = 123) {
  return JSON.stringify({ number, url: `https://github.com/org/repo/pull/${number}` });
}

function ghClient(calls: string[][], outputs: Array<string | Error>): GhClientLike {
  return {
    run: async (args) => {
      calls.push(args);
      const next = outputs.shift();

      if (next instanceof Error) {
        throw next;
      }

      return { args, stdout: next ?? '{}', stderr: '' };
    },
  };
}

describe('listGitHubReviewThreads', () => {
  it('uses the PR URL repository for gh api graphql without mutations', async () => {
    const calls: string[][] = [];
    const result = await listGitHubReviewThreads({
      pr: 123,
      ghClient: ghClient(calls, [prView(), fixture('review-threads.graphql.json')]),
    });

    expect(result.prNumber).toBe(123);
    expect(result.owner).toBe('org');
    expect(result.repo).toBe('repo');
    expect(result.threads).toHaveLength(2);
    expect(calls[0]).toEqual(['pr', 'view', '123', '--json', 'number,url']);
    expect(calls[1]?.slice(0, 2)).toEqual(['api', 'graphql']);
    expect(calls.flat().join(' ').toLowerCase()).not.toContain('mutation');
  });

  it('handles empty reviewThreads responses', async () => {
    const result = await listGitHubReviewThreads({
      pr: 123,
      ghClient: ghClient([], [prView(), fixture('review-threads-empty.graphql.json')]),
    });

    expect(result.threads).toEqual([]);
    expect(result.incomplete).toBe(false);
  });

  it('warns when maxThreads truncates a paginated review thread scan', async () => {
    const raw = JSON.parse(fixture('review-threads.graphql.json'));
    raw.data.repository.pullRequest.reviewThreads.pageInfo = {
      hasNextPage: true,
      endCursor: 'cursor-1',
    };
    raw.data.repository.pullRequest.reviewThreads.nodes = [
      raw.data.repository.pullRequest.reviewThreads.nodes[0],
    ];
    const result = await listGitHubReviewThreads({
      pr: 123,
      maxThreads: 1,
      ghClient: ghClient([], [prView(), JSON.stringify(raw)]),
    });

    expect(result.threads).toHaveLength(1);
    expect(result.incomplete).toBe(true);
    expect(result.warnings.join('\n')).toContain('maxThreads=1');
  });

  it('paginates review threads up to maxThreads', async () => {
    const firstPage = JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            number: 123,
            url: 'https://github.com/org/repo/pull/123',
            reviewThreads: {
              pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
              nodes: [JSON.parse(fixture('review-threads.graphql.json')).data.repository.pullRequest.reviewThreads.nodes[0]],
            },
          },
        },
      },
    });
    const secondPage = JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            number: 123,
            url: 'https://github.com/org/repo/pull/123',
            reviewThreads: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [JSON.parse(fixture('review-threads.graphql.json')).data.repository.pullRequest.reviewThreads.nodes[1]],
            },
          },
        },
      },
    });
    const calls: string[][] = [];
    const result = await listGitHubReviewThreads({
      pr: 123,
      maxThreads: 2,
      ghClient: ghClient(calls, [prView(), firstPage, secondPage]),
    });

    expect(result.threads.map((thread) => thread.threadId)).toEqual(['PRRT_thread_1', 'PRRT_thread_2']);
    expect(calls.filter((args) => args[0] === 'api' && args[1] === 'graphql')).toHaveLength(2);
    expect(calls[2]).toEqual(expect.arrayContaining(['threadCursor=cursor-1']));
  });

  it('paginates comments inside a thread when GitHub marks comments hasNextPage', async () => {
    const raw = JSON.parse(fixture('review-threads.graphql.json'));
    raw.data.repository.pullRequest.reviewThreads.nodes = [raw.data.repository.pullRequest.reviewThreads.nodes[0]];
    raw.data.repository.pullRequest.reviewThreads.nodes[0].comments.pageInfo = {
      hasNextPage: true,
      endCursor: 'comment-cursor-1',
    };
    const commentPage = JSON.stringify({
      data: {
        node: {
          id: 'PRRT_thread_1',
          comments: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: 'PRRC_comment_1b',
                databaseId: '1005',
                author: { login: 'coderabbitai' },
                authorAssociation: 'NONE',
                body: 'Follow-up comment.',
                path: 'src/foo.ts',
                line: 43,
                createdAt: '2026-01-01T00:08:00Z',
                updatedAt: '2026-01-01T00:09:00Z',
                url: 'https://github.com/org/repo/pull/123#discussion_r5',
                isMinimized: false,
                viewerCanUpdate: false,
                viewerCanDelete: false,
              },
            ],
          },
        },
      },
    });
    const calls: string[][] = [];
    const result = await listGitHubReviewThreads({
      pr: 123,
      ghClient: ghClient(calls, [prView(), JSON.stringify(raw), commentPage]),
    });

    expect(result.threads[0]?.comments).toHaveLength(2);
    expect(result.threads[0]?.latestComment?.id).toBe('PRRC_comment_1b');
    expect(calls.filter((args) => args[0] === 'api' && args[1] === 'graphql')).toHaveLength(2);
  });

  it('maps gh missing, auth, API errors, and unexpected shapes to Codeflow errors', async () => {
    await expect(listGitHubReviewThreads({
      pr: 123,
      ghClient: ghClient([], [new GithubCliError({ code: 'gh_missing', message: 'missing', args: ['repo', 'view'] })]),
    })).rejects.toMatchObject({ code: 'gh_missing' });

    await expect(listGitHubReviewThreads({
      pr: 123,
      ghClient: ghClient([], [new GithubCliError({ code: 'gh_auth_required', message: 'auth', args: ['repo', 'view'] })]),
    })).rejects.toMatchObject({ code: 'gh_auth_required' });

    await expect(listGitHubReviewThreads({
      pr: 123,
      ghClient: ghClient([], [prView(), JSON.stringify({ errors: [{ message: 'Resource not accessible by integration' }] })]),
    })).rejects.toMatchObject({ code: 'permission_denied' });

    await expect(listGitHubReviewThreads({
      pr: 123,
      ghClient: ghClient([], [prView(), JSON.stringify({ data: { repository: {} } })]),
    })).rejects.toBeInstanceOf(CodeflowReviewCommentsError);
  });

  it('returns a no_pr_found error when no PR is associated with the current branch', async () => {
    await expect(listGitHubReviewThreads({
      ghClient: ghClient([], [
        new GithubCliError({
          code: 'gh_command_failed',
          message: 'no pull requests found for branch',
          args: ['pr', 'view'],
          stderr: 'no pull requests found for branch',
        }),
      ]),
    })).rejects.toMatchObject({ code: 'no_pr_found' });
  });
});
