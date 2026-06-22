import { describe, expect, it } from 'vitest';

import {
  PR_REVIEW_THREAD_REPLY_MUTATION,
  PR_REVIEW_THREAD_RESOLVE_MUTATION,
  buildReviewThreadReplyMutationArgs,
  buildReviewThreadResolveMutationArgs,
} from '../../src/github/pr-review-thread-mutations';

describe('review thread GraphQL mutation builders', () => {
  it('builds addPullRequestReviewThreadReply with variables', () => {
    const args = buildReviewThreadReplyMutationArgs({
      threadId: 'PRRT_thread_1',
      body: 'Thanks; fixed.',
    });

    expect(args.slice(0, 3)).toEqual(['api', 'graphql', '-f']);
    expect(args).toEqual(expect.arrayContaining(['threadId=PRRT_thread_1', 'body=Thanks; fixed.']));
    expect(args[args.indexOf('threadId=PRRT_thread_1') - 1]).toBe('-f');
    expect(args[args.indexOf('body=Thanks; fixed.') - 1]).toBe('-f');
    expect(PR_REVIEW_THREAD_REPLY_MUTATION).toContain('addPullRequestReviewThreadReply');
    expect(PR_REVIEW_THREAD_REPLY_MUTATION).toContain('pullRequestReviewThreadId: $threadId');
    expect(PR_REVIEW_THREAD_REPLY_MUTATION).toContain('body: $body');
    expect(PR_REVIEW_THREAD_REPLY_MUTATION).not.toContain('thread {');
    expect(PR_REVIEW_THREAD_REPLY_MUTATION).not.toContain('PRRT_thread_1');
    expect(PR_REVIEW_THREAD_REPLY_MUTATION).not.toContain('Thanks; fixed.');
  });

  it('builds resolveReviewThread with variables and no unrelated mutations', () => {
    const args = buildReviewThreadResolveMutationArgs({ threadId: 'PRRT_thread_1' });

    expect(args).toEqual(expect.arrayContaining(['threadId=PRRT_thread_1']));
    expect(PR_REVIEW_THREAD_RESOLVE_MUTATION).toContain('resolveReviewThread');
    expect(PR_REVIEW_THREAD_RESOLVE_MUTATION).toContain('threadId: $threadId');
    expect(PR_REVIEW_THREAD_RESOLVE_MUTATION).not.toContain('PRRT_thread_1');
    expect(`${PR_REVIEW_THREAD_REPLY_MUTATION}\n${PR_REVIEW_THREAD_RESOLVE_MUTATION}`).not.toMatch(/unresolveReviewThread|mergePullRequest|addPullRequestReview\(/);
  });
});
