import { GhClient, type GhClientLike } from './gh-client';
import { GithubCliError } from './github-errors';
import {
  buildReviewThreadCommentsGraphqlArgs,
  buildReviewThreadsGraphqlArgs,
} from './pr-review-threads-query';
import { normalizeReviewThreads } from '../review-comments/review-thread-normalizer';
import type { CodeflowReviewThread } from '../review-comments/review-thread';
import { CodeflowReviewCommentsError } from '../review-comments/review-comments-errors';
import { parseJson } from '../utils/json';
import { truncateText } from '../utils/text';

const DEFAULT_MAX_THREADS = 50;
const MAX_GRAPHQL_PAGE_SIZE = 100;
const DEFAULT_COMMENTS_FIRST = 100;

export interface ListGitHubReviewThreadsOptions {
  cwd?: string;
  pr?: number | string;
  maxThreads?: number;
  ghClient?: GhClientLike;
  commentsFirst?: number;
}

export interface GitHubReviewThreadsListResult {
  owner: string;
  repo: string;
  repoUrl: string | null;
  prNumber: number;
  prUrl: string | null;
  threads: CodeflowReviewThread[];
  warnings: string[];
}

interface RepositoryMetadata {
  owner: string;
  repo: string;
  url: string | null;
}

interface PullRequestMetadata {
  number: number;
  url: string | null;
}

interface ReviewThreadsPage {
  prNumber: number;
  prUrl: string | null;
  nodes: Record<string, unknown>[];
  hasNextPage: boolean;
  endCursor: string | null;
}

interface CommentsPage {
  nodes: unknown[];
  hasNextPage: boolean;
  endCursor: string | null;
}

export async function listGitHubReviewThreads(
  options: ListGitHubReviewThreadsOptions = {},
): Promise<GitHubReviewThreadsListResult> {
  const cwd = options.cwd ?? process.cwd();
  const ghClient = options.ghClient ?? new GhClient({ cwd });
  const maxThreads = resolvePositiveInteger(options.maxThreads ?? DEFAULT_MAX_THREADS, 'maxThreads');
  const commentsFirst = Math.min(
    MAX_GRAPHQL_PAGE_SIZE,
    resolvePositiveInteger(options.commentsFirst ?? DEFAULT_COMMENTS_FIRST, 'commentsFirst'),
  );
  const repository = await getRepositoryMetadata(ghClient);
  const pullRequest = await getPullRequestMetadata(ghClient, options.pr);
  const rawThreads: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  let pageNumber = 0;

  while (rawThreads.length < maxThreads) {
    pageNumber += 1;
    const threadsFirst = Math.min(MAX_GRAPHQL_PAGE_SIZE, maxThreads - rawThreads.length);
    const result = await runGraphql(ghClient, buildReviewThreadsGraphqlArgs({
      owner: repository.owner,
      repo: repository.repo,
      prNumber: pullRequest.number,
      threadsFirst,
      threadCursor: cursor,
      commentsFirst,
    }));
    const page = parseReviewThreadsPage(result.stdout, pullRequest.number);

    for (const node of page.nodes) {
      rawThreads.push(await hydrateThreadComments(ghClient, node, commentsFirst));
    }

    if (!page.hasNextPage || rawThreads.length >= maxThreads) {
      break;
    }

    if (!page.endCursor || page.endCursor === cursor) {
      throw new CodeflowReviewCommentsError({
        code: 'pagination_failed',
        message: 'GitHub review thread pagination did not return a usable next cursor.',
        details: { pageNumber, cursor: page.endCursor },
      });
    }

    cursor = page.endCursor;
  }

  return {
    owner: repository.owner,
    repo: repository.repo,
    repoUrl: repository.url,
    prNumber: pullRequest.number,
    prUrl: pullRequest.url,
    threads: normalizeReviewThreads(rawThreads, { prNumber: pullRequest.number }),
    warnings: [],
  };
}

async function getRepositoryMetadata(ghClient: GhClientLike): Promise<RepositoryMetadata> {
  try {
    const result = await ghClient.run(['repo', 'view', '--json', 'nameWithOwner,url']);
    const parsed = parseJsonObject(result.stdout, 'GitHub CLI returned invalid repository metadata JSON.');
    const nameWithOwner = readString(parsed.nameWithOwner);
    const [owner, repo] = nameWithOwner?.split('/', 2) ?? [];

    if (!owner || !repo) {
      throw new CodeflowReviewCommentsError({
        code: 'unexpected_response',
        message: 'GitHub CLI repository metadata did not include nameWithOwner.',
        details: { outputPreview: truncateText(result.stdout, 1000) },
      });
    }

    return {
      owner,
      repo,
      url: readString(parsed.url),
    };
  } catch (error) {
    throw mapGithubCliOrCodeflowError(error, 'repository_not_found');
  }
}

async function getPullRequestMetadata(
  ghClient: GhClientLike,
  pr: number | string | undefined,
): Promise<PullRequestMetadata> {
  const args = ['pr', 'view'];
  const prNumber = pr === undefined ? undefined : normalizePrNumber(pr);

  if (prNumber !== undefined) {
    args.push(String(prNumber));
  }

  args.push('--json', 'number,url');

  try {
    const result = await ghClient.run(args);
    const parsed = parseJsonObject(result.stdout, 'GitHub CLI returned invalid pull request metadata JSON.');
    const number = readNumber(parsed.number);

    if (!number || !Number.isInteger(number) || number <= 0) {
      throw new CodeflowReviewCommentsError({
        code: 'unexpected_response',
        message: 'GitHub CLI pull request metadata did not include a PR number.',
        details: { outputPreview: truncateText(result.stdout, 1000) },
      });
    }

    return {
      number,
      url: readString(parsed.url),
    };
  } catch (error) {
    throw mapGithubCliOrCodeflowError(error, prNumber === undefined ? 'no_pr_found' : 'pr_not_found');
  }
}

async function runGraphql(
  ghClient: GhClientLike,
  args: string[],
): Promise<{ stdout: string }> {
  try {
    return await ghClient.run(args);
  } catch (error) {
    throw mapGithubCliOrCodeflowError(error, 'graphql_failed');
  }
}

function parseReviewThreadsPage(stdout: string, fallbackPrNumber: number): ReviewThreadsPage {
  const parsed = parseJsonObject(stdout, 'GitHub GraphQL returned invalid JSON for review threads.');
  throwOnGraphqlErrors(parsed);
  const data = isRecord(parsed.data) ? parsed.data : null;
  const repository = data && 'repository' in data ? data.repository : null;

  if (repository === null) {
    throw new CodeflowReviewCommentsError({
      code: 'repository_not_found',
      message: 'GitHub repository was not found while reading review threads.',
    });
  }

  if (!isRecord(repository)) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'GitHub GraphQL review thread response did not contain repository data.',
    });
  }

  const pullRequest = repository.pullRequest;

  if (pullRequest === null) {
    throw new CodeflowReviewCommentsError({
      code: 'pr_not_found',
      message: 'The requested pull request was not found while reading review threads.',
    });
  }

  if (!isRecord(pullRequest)) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'GitHub GraphQL review thread response did not contain pull request data.',
    });
  }

  const reviewThreads = pullRequest.reviewThreads;

  if (!isRecord(reviewThreads)) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'GitHub GraphQL response did not contain reviewThreads data.',
    });
  }

  const pageInfo = isRecord(reviewThreads.pageInfo) ? reviewThreads.pageInfo : {};

  return {
    prNumber: readNumber(pullRequest.number) ?? fallbackPrNumber,
    prUrl: readString(pullRequest.url),
    nodes: extractConnectionNodes(reviewThreads).map((node) => {
      if (!isRecord(node)) {
        throw new CodeflowReviewCommentsError({
          code: 'unexpected_response',
          message: 'GitHub GraphQL reviewThreads connection returned a non-object node.',
        });
      }

      return node;
    }),
    hasNextPage: pageInfo.hasNextPage === true,
    endCursor: readString(pageInfo.endCursor),
  };
}

async function hydrateThreadComments(
  ghClient: GhClientLike,
  thread: Record<string, unknown>,
  commentsFirst: number,
): Promise<Record<string, unknown>> {
  const comments = isRecord(thread.comments) ? thread.comments : null;
  const pageInfo = comments && isRecord(comments.pageInfo) ? comments.pageInfo : null;

  if (!comments || !pageInfo || pageInfo.hasNextPage !== true) {
    return thread;
  }

  const threadId = readString(thread.id);

  if (!threadId) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'Cannot paginate review thread comments without a thread ID.',
    });
  }

  const nodes = extractConnectionNodes(comments);
  let cursor = readString(pageInfo.endCursor);

  if (!cursor) {
    throw new CodeflowReviewCommentsError({
      code: 'pagination_failed',
      message: 'GitHub review comment pagination did not return a usable first cursor.',
      details: { threadId },
    });
  }

  while (cursor) {
    const result = await runGraphql(ghClient, buildReviewThreadCommentsGraphqlArgs({
      threadId,
      commentsFirst,
      commentsCursor: cursor,
    }));
    const page = parseThreadCommentsPage(result.stdout);
    nodes.push(...page.nodes);

    if (!page.hasNextPage) {
      break;
    }

    if (!page.endCursor || page.endCursor === cursor) {
      throw new CodeflowReviewCommentsError({
        code: 'pagination_failed',
        message: 'GitHub review comment pagination did not return a usable next cursor.',
        details: { threadId, cursor: page.endCursor },
      });
    }

    cursor = page.endCursor;
  }

  return {
    ...thread,
    comments: {
      ...comments,
      nodes,
      pageInfo: {
        hasNextPage: false,
        endCursor: cursor,
      },
    },
  };
}

function parseThreadCommentsPage(stdout: string): CommentsPage {
  const parsed = parseJsonObject(stdout, 'GitHub GraphQL returned invalid JSON for review thread comments.');
  throwOnGraphqlErrors(parsed);
  const data = isRecord(parsed.data) ? parsed.data : null;
  const node = data && 'node' in data ? data.node : null;

  if (!isRecord(node)) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'GitHub GraphQL response did not contain review thread comment data.',
    });
  }

  const comments = node.comments;

  if (!isRecord(comments)) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message: 'GitHub GraphQL response did not contain comments data.',
    });
  }

  const pageInfo = isRecord(comments.pageInfo) ? comments.pageInfo : {};

  return {
    nodes: extractConnectionNodes(comments),
    hasNextPage: pageInfo.hasNextPage === true,
    endCursor: readString(pageInfo.endCursor),
  };
}

function throwOnGraphqlErrors(parsed: Record<string, unknown>): void {
  if (!Array.isArray(parsed.errors) || parsed.errors.length === 0) {
    return;
  }

  const text = JSON.stringify(parsed.errors).slice(0, 2000);

  if (looksLikePermissionDenied(text)) {
    throw new CodeflowReviewCommentsError({
      code: 'permission_denied',
      message: 'GitHub denied access while reading review threads.',
      details: { errors: parsed.errors },
    });
  }

  if (looksLikeRepositoryNotFound(text)) {
    throw new CodeflowReviewCommentsError({
      code: 'repository_not_found',
      message: 'GitHub repository was not found while reading review threads.',
      details: { errors: parsed.errors },
    });
  }

  throw new CodeflowReviewCommentsError({
    code: 'graphql_failed',
    message: 'GitHub GraphQL returned errors while reading review threads.',
    details: { errors: parsed.errors },
  });
}

function extractConnectionNodes(connection: Record<string, unknown>): unknown[] {
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

function parseJsonObject(stdout: string, message: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = parseJson(stdout);
  } catch (error) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message,
      details: { outputPreview: truncateText(stdout, 1000) },
      cause: error,
    });
  }

  if (!isRecord(parsed)) {
    throw new CodeflowReviewCommentsError({
      code: 'unexpected_response',
      message,
      details: { outputPreview: truncateText(stdout, 1000) },
    });
  }

  return parsed;
}

function normalizePrNumber(value: number | string): number {
  const raw = String(value);
  const parsed = Number.parseInt(raw, 10);

  if (!/^\d+$/.test(raw) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new CodeflowReviewCommentsError({
      code: 'invalid_arguments',
      message: 'Pull request number must be a positive integer.',
      details: { pr: value },
    });
  }

  return parsed;
}

function resolvePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CodeflowReviewCommentsError({
      code: 'invalid_arguments',
      message: `${name} must be a positive integer.`,
      details: { [name]: value },
    });
  }

  return value;
}

function mapGithubCliOrCodeflowError(
  error: unknown,
  notFoundCode: 'repository_not_found' | 'no_pr_found' | 'pr_not_found' | 'graphql_failed',
): CodeflowReviewCommentsError {
  if (error instanceof CodeflowReviewCommentsError) {
    return error;
  }

  if (!(error instanceof GithubCliError)) {
    return new CodeflowReviewCommentsError({
      code: 'graphql_failed',
      message: error instanceof Error ? error.message : 'GitHub review thread read failed.',
      cause: error,
    });
  }

  if (error.code === 'gh_missing') {
    return new CodeflowReviewCommentsError({
      code: 'gh_missing',
      message: error.message,
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (error.code === 'gh_auth_required') {
    return new CodeflowReviewCommentsError({
      code: 'gh_auth_required',
      message: error.message,
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  const text = `${error.stdout}\n${error.stderr}\n${error.message}`;

  if (looksLikeRepositoryNotFound(text)) {
    return new CodeflowReviewCommentsError({
      code: 'repository_not_found',
      message: 'GitHub repository was not found for this working tree.',
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (looksLikePermissionDenied(text)) {
    return new CodeflowReviewCommentsError({
      code: 'permission_denied',
      message: 'GitHub denied access while reading review threads.',
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (looksLikeNetworkFailure(text)) {
    return new CodeflowReviewCommentsError({
      code: 'network_error',
      message: 'GitHub CLI could not reach GitHub while reading review threads.',
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (looksLikeNoPrFound(text)) {
    return new CodeflowReviewCommentsError({
      code: notFoundCode === 'graphql_failed' ? 'pr_not_found' : notFoundCode,
      message: notFoundCode === 'no_pr_found'
        ? 'No pull request was found for the current branch. Run /flow-pr first or pass --pr <number>.'
        : 'The requested pull request was not found.',
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  return new CodeflowReviewCommentsError({
    code: notFoundCode,
    message: `gh ${error.args.join(' ')} failed: ${error.message}`,
    details: githubErrorDetails(error),
    cause: error,
  });
}

function looksLikeNoPrFound(value: string): boolean {
  return /no pull requests? found|pull request not found|could not resolve.*pull request|not found/i.test(value);
}

function looksLikeRepositoryNotFound(value: string): boolean {
  return /repository not found|could not resolve to a repository|http\s+404/i.test(value);
}

function looksLikePermissionDenied(value: string): boolean {
  return /permission denied|resource not accessible|forbidden|http\s+403|not authorized/i.test(value);
}

function looksLikeNetworkFailure(value: string): boolean {
  return /network|timeout|timed out|tls|connection|temporary failure|could not resolve host|eof/i.test(value);
}

function githubErrorDetails(error: GithubCliError): Record<string, unknown> {
  return {
    args: error.args,
    exitCode: error.exitCode ?? null,
    stdout: truncateText(error.stdout, 1000),
    stderr: truncateText(error.stderr, 1000),
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
