export const PR_REVIEW_THREADS_GRAPHQL_QUERY = `query CodeflowPullRequestReviewThreads(
  $owner: String!
  $name: String!
  $number: Int!
  $threadsFirst: Int!
  $threadCursor: String
  $commentsFirst: Int!
) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      url
      reviewThreads(first: $threadsFirst, after: $threadCursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          originalStartLine
          viewerCanResolve
          viewerCanReply
          comments(first: $commentsFirst) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              databaseId: fullDatabaseId
              author {
                login
              }
              authorAssociation
              body
              path
              line
              createdAt
              updatedAt
              url
              isMinimized
              viewerCanUpdate
              viewerCanDelete
            }
          }
        }
      }
    }
  }
}`;

export const PR_REVIEW_THREAD_COMMENTS_GRAPHQL_QUERY = `query CodeflowPullRequestReviewThreadComments(
  $threadId: ID!
  $commentsFirst: Int!
  $commentsCursor: String
) {
  node(id: $threadId) {
    ... on PullRequestReviewThread {
      id
      comments(first: $commentsFirst, after: $commentsCursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          databaseId: fullDatabaseId
          author {
            login
          }
          authorAssociation
          body
          path
          line
          createdAt
          updatedAt
          url
          isMinimized
          viewerCanUpdate
          viewerCanDelete
        }
      }
    }
  }
}`;

export interface BuildReviewThreadsGraphqlArgsOptions {
  owner: string;
  repo: string;
  prNumber: number;
  threadsFirst: number;
  threadCursor?: string | null;
  commentsFirst: number;
}

export interface BuildReviewThreadCommentsGraphqlArgsOptions {
  threadId: string;
  commentsFirst: number;
  commentsCursor?: string | null;
}

export function buildReviewThreadsGraphqlArgs(
  options: BuildReviewThreadsGraphqlArgsOptions,
): string[] {
  const args = [
    'api',
    'graphql',
    '-f',
    `query=${PR_REVIEW_THREADS_GRAPHQL_QUERY}`,
    '-F',
    `owner=${options.owner}`,
    '-F',
    `name=${options.repo}`,
    '-F',
    `number=${options.prNumber}`,
    '-F',
    `threadsFirst=${options.threadsFirst}`,
    '-F',
    `commentsFirst=${options.commentsFirst}`,
  ];

  if (options.threadCursor) {
    args.push('-F', `threadCursor=${options.threadCursor}`);
  }

  return args;
}

export function buildReviewThreadCommentsGraphqlArgs(
  options: BuildReviewThreadCommentsGraphqlArgsOptions,
): string[] {
  const args = [
    'api',
    'graphql',
    '-f',
    `query=${PR_REVIEW_THREAD_COMMENTS_GRAPHQL_QUERY}`,
    '-F',
    `threadId=${options.threadId}`,
    '-F',
    `commentsFirst=${options.commentsFirst}`,
  ];

  if (options.commentsCursor) {
    args.push('-F', `commentsCursor=${options.commentsCursor}`);
  }

  return args;
}
