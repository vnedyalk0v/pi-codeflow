import { describe, expect, it } from 'vitest';

import {
  PR_REVIEW_THREAD_COMMENTS_GRAPHQL_QUERY,
  PR_REVIEW_THREADS_GRAPHQL_QUERY,
  buildReviewThreadCommentsGraphqlArgs,
  buildReviewThreadsGraphqlArgs,
} from '../../src/github/pr-review-threads-query';

describe('review thread GraphQL query builders', () => {
  it('builds gh api graphql args using variables instead of owner/repo interpolation', () => {
    const args = buildReviewThreadsGraphqlArgs({
      owner: 'org',
      repo: 'repo',
      prNumber: 123,
      threadsFirst: 50,
      commentsFirst: 100,
    });

    expect(args.slice(0, 3)).toEqual(['api', 'graphql', '-f']);
    expect(args[args.indexOf('owner=org') - 1]).toBe('-f');
    expect(args[args.indexOf('name=repo') - 1]).toBe('-f');
    expect(args[args.indexOf('number=123') - 1]).toBe('-F');
    expect(args).toEqual(expect.arrayContaining([
      'owner=org',
      'name=repo',
      'number=123',
      'threadsFirst=50',
      'commentsFirst=100',
    ]));
    expect(PR_REVIEW_THREADS_GRAPHQL_QUERY).toContain('repository(owner: $owner, name: $name)');
    expect(PR_REVIEW_THREADS_GRAPHQL_QUERY).toContain('pullRequest(number: $number)');
    expect(PR_REVIEW_THREADS_GRAPHQL_QUERY).not.toContain('org/repo');
    expect(PR_REVIEW_THREADS_GRAPHQL_QUERY).not.toContain('name: "repo"');
    expect(PR_REVIEW_THREADS_GRAPHQL_QUERY.toLowerCase()).not.toContain('mutation');
  });

  it('builds thread and comment pagination args without GraphQL mutations', () => {
    const threadArgs = buildReviewThreadsGraphqlArgs({
      owner: 'org',
      repo: 'repo',
      prNumber: 123,
      threadsFirst: 10,
      threadCursor: 'cursor-1',
      commentsFirst: 20,
    });

    expect(threadArgs).toEqual(expect.arrayContaining(['threadCursor=cursor-1']));
    expect(threadArgs[threadArgs.indexOf('threadCursor=cursor-1') - 1]).toBe('-f');

    const commentsArgs = buildReviewThreadCommentsGraphqlArgs({
      threadId: 'PRRT_thread_1',
      commentsFirst: 100,
      commentsCursor: 'comment-cursor',
    });

    expect(commentsArgs).toEqual(expect.arrayContaining(['threadId=PRRT_thread_1', 'commentsCursor=comment-cursor']));
    expect(commentsArgs[commentsArgs.indexOf('threadId=PRRT_thread_1') - 1]).toBe('-f');
    expect(commentsArgs[commentsArgs.indexOf('commentsCursor=comment-cursor') - 1]).toBe('-f');
    expect(PR_REVIEW_THREAD_COMMENTS_GRAPHQL_QUERY.toLowerCase()).not.toContain('mutation');
  });
});
