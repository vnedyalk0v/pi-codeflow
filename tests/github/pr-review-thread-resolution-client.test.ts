import { describe, expect, it } from 'vitest';

import { resolveReviewThread } from '../../src/github/pr-review-thread-resolution-client';
import type { GhClientLike } from '../../src/github/gh-client';

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

describe('resolveReviewThread', () => {
  it('calls resolveReviewThread and returns normalized results', async () => {
    const calls: string[][] = [];
    const result = await resolveReviewThread({
      threadId: 'PRRT_thread_1',
      ghClient: ghClient(calls, [JSON.stringify({
        data: {
          resolveReviewThread: {
            thread: { id: 'PRRT_thread_1', isResolved: true },
          },
        },
      })]),
    });

    expect(result.status).toBe('resolved');
    expect(result.resolved).toBe(true);
    expect(calls[0]?.join(' ')).toContain('resolveReviewThread');
    expect(calls[0]?.join(' ')).not.toMatch(/unresolveReviewThread|mergePullRequest|addPullRequestReview\(/);
  });

  it('maps already resolved and not found errors clearly', async () => {
    await expect(resolveReviewThread({
      threadId: 'PRRT_thread_1',
      ghClient: ghClient([], [JSON.stringify({ errors: [{ message: 'Thread is already resolved' }] })]),
    })).rejects.toMatchObject({ code: 'thread_already_resolved' });

    await expect(resolveReviewThread({
      threadId: 'PRRT_thread_404',
      ghClient: ghClient([], [JSON.stringify({ errors: [{ message: 'Could not resolve to a node' }] })]),
    })).rejects.toMatchObject({ code: 'thread_not_found' });
  });
});
