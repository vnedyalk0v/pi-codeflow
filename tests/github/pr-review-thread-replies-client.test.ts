import { describe, expect, it } from 'vitest';

import { replyToReviewThread } from '../../src/github/pr-review-thread-replies-client';
import type { GhClientLike } from '../../src/github/gh-client';
import { GithubCliError } from '../../src/github/github-errors';

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

describe('replyToReviewThread', () => {
  it('calls addPullRequestReviewThreadReply and returns normalized results', async () => {
    const calls: string[][] = [];
    const result = await replyToReviewThread({
      threadId: 'PRRT_thread_1',
      body: 'Fixed with tests.',
      ghClient: ghClient(calls, [JSON.stringify({
        data: {
          addPullRequestReviewThreadReply: {
            comment: { id: 'PRRC_reply_1', url: 'https://github.com/org/repo/pull/1#discussion_r1' },
            thread: { id: 'PRRT_thread_1', isResolved: false },
          },
        },
      })]),
    });

    expect(result.status).toBe('posted');
    expect(result.commentId).toBe('PRRC_reply_1');
    expect(calls[0]?.join(' ')).toContain('addPullRequestReviewThreadReply');
    expect(calls[0]?.join(' ')).not.toContain('mergePullRequest');
  });

  it('maps permission and missing thread errors clearly', async () => {
    await expect(replyToReviewThread({
      threadId: 'PRRT_thread_1',
      body: 'Fixed.',
      ghClient: ghClient([], [JSON.stringify({ errors: [{ message: 'Resource not accessible by integration' }] })]),
    })).rejects.toMatchObject({ code: 'permission_denied' });

    await expect(replyToReviewThread({
      threadId: 'PRRT_thread_404',
      body: 'Fixed.',
      ghClient: ghClient([], [new GithubCliError({
        code: 'gh_command_failed',
        message: 'Could not resolve to a node',
        args: ['api', 'graphql'],
        stderr: 'Could not resolve to a node',
      })]),
    })).rejects.toMatchObject({ code: 'thread_not_found' });
  });
});
