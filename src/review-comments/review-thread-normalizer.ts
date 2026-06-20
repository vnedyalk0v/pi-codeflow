import type { CodeflowReviewComment } from './review-comment';
import type { CodeflowReviewThread } from './review-thread';
import { CodeflowReviewCommentsError } from './review-comments-errors';

export interface NormalizeReviewThreadsOptions {
  prNumber?: number;
}

export function normalizeReviewThreads(
  input: unknown,
  options: NormalizeReviewThreadsOptions = {},
): CodeflowReviewThread[] {
  const prNumber = options.prNumber ?? extractPrNumber(input);

  if (!isPositiveInteger(prNumber)) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'Cannot normalize review threads without a pull request number.',
      details: { prNumber },
    });
  }

  return extractThreadNodes(input).map((thread) => normalizeThread(thread, prNumber));
}

function normalizeThread(input: unknown, prNumber: number): CodeflowReviewThread {
  if (!isRecord(input)) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'GitHub review thread entry had an unexpected shape.',
    });
  }

  const threadId = readString(input.id);

  if (!threadId) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'GitHub review thread was missing its GraphQL node ID.',
    });
  }

  const comments = extractCommentNodes(input.comments).map(normalizeComment);
  const firstComment = comments[0] ?? null;
  const latestComment = comments[comments.length - 1] ?? null;
  const path = readString(input.path) ?? latestComment?.path ?? firstComment?.path ?? null;
  const line = readNumber(input.line) ?? latestComment?.line ?? firstComment?.line ?? null;
  const startLine = readNumber(input.startLine) ?? readNumber(input.originalStartLine);

  return {
    threadId,
    prNumber,
    path,
    line,
    startLine,
    isResolved: readBoolean(input.isResolved),
    isOutdated: readBoolean(input.isOutdated),
    author: firstComment?.author ?? null,
    authorAssociation: firstComment?.authorAssociation ?? null,
    firstComment,
    comments,
    latestComment,
    createdAt: firstComment?.createdAt ?? null,
    updatedAt: latestComment?.updatedAt ?? firstComment?.updatedAt ?? null,
    url: latestComment?.url ?? firstComment?.url ?? null,
    source: 'github-graphql',
    canResolve: readBoolean(input.viewerCanResolve),
    canReply: readBoolean(input.viewerCanReply),
  };
}

function normalizeComment(input: unknown): CodeflowReviewComment {
  if (!isRecord(input)) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'GitHub review comment entry had an unexpected shape.',
    });
  }

  const id = readString(input.id);

  if (!id) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'GitHub review comment was missing its GraphQL node ID.',
    });
  }

  return {
    id,
    databaseId: readDatabaseId(input.databaseId),
    author: readAuthorLogin(input.author),
    authorAssociation: readString(input.authorAssociation),
    body: readString(input.body) ?? '',
    path: readString(input.path),
    line: readNumber(input.line),
    createdAt: readString(input.createdAt),
    updatedAt: readString(input.updatedAt),
    url: readString(input.url),
    isMinimized: readBoolean(input.isMinimized),
    viewerCanUpdate: readBoolean(input.viewerCanUpdate),
    viewerCanDelete: readBoolean(input.viewerCanDelete),
  };
}

function extractPrNumber(input: unknown): number | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const pullRequest = extractPullRequest(input);
  return isRecord(pullRequest) ? readNumber(pullRequest.number) ?? undefined : undefined;
}

function extractThreadNodes(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input;
  }

  if (!isRecord(input)) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'GitHub review threads response had an unexpected shape.',
    });
  }

  const pullRequest = extractPullRequest(input);

  if (!isRecord(pullRequest)) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'GitHub review threads response did not contain pull request data.',
    });
  }

  const connection = pullRequest.reviewThreads;

  if (!isRecord(connection)) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'GitHub review threads response did not contain a reviewThreads connection.',
    });
  }

  return extractNodesFromConnection(connection);
}

function extractCommentNodes(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input;
  }

  if (!isRecord(input)) {
    return [];
  }

  return extractNodesFromConnection(input);
}

function extractNodesFromConnection(connection: Record<string, unknown>): unknown[] {
  if (Array.isArray(connection.nodes)) {
    return connection.nodes.filter((node) => node !== null);
  }

  if (Array.isArray(connection.edges)) {
    return connection.edges
      .map((edge) => isRecord(edge) ? edge.node : null)
      .filter((node) => node !== null);
  }

  return [];
}

function extractPullRequest(input: Record<string, unknown>): unknown {
  const data = input.data;
  const repository = isRecord(data) ? data.repository : input.repository;
  return isRecord(repository) ? repository.pullRequest : input.pullRequest;
}

function readAuthorLogin(value: unknown): string | null {
  return isRecord(value) ? readString(value.login) : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readDatabaseId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
