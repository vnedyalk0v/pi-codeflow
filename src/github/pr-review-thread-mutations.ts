export const PR_REVIEW_THREAD_REPLY_MUTATION = `mutation CodeflowAddPullRequestReviewThreadReply(
  $threadId: ID!
  $body: String!
) {
  addPullRequestReviewThreadReply(input: {
    pullRequestReviewThreadId: $threadId
    body: $body
  }) {
    comment {
      id
      url
    }
  }
}`;

export const PR_REVIEW_THREAD_RESOLVE_MUTATION = `mutation CodeflowResolveReviewThread(
  $threadId: ID!
) {
  resolveReviewThread(input: {
    threadId: $threadId
  }) {
    thread {
      id
      isResolved
    }
  }
}`;

export interface BuildReviewThreadReplyMutationArgsOptions {
  threadId: string;
  body: string;
}

export interface BuildReviewThreadResolveMutationArgsOptions {
  threadId: string;
}

export function buildReviewThreadReplyMutationArgs(
  options: BuildReviewThreadReplyMutationArgsOptions,
): string[] {
  return [
    'api',
    'graphql',
    '-f',
    `query=${PR_REVIEW_THREAD_REPLY_MUTATION}`,
    '-f',
    `threadId=${options.threadId}`,
    '-f',
    `body=${options.body}`,
  ];
}

export function buildReviewThreadResolveMutationArgs(
  options: BuildReviewThreadResolveMutationArgsOptions,
): string[] {
  return [
    'api',
    'graphql',
    '-f',
    `query=${PR_REVIEW_THREAD_RESOLVE_MUTATION}`,
    '-f',
    `threadId=${options.threadId}`,
  ];
}
