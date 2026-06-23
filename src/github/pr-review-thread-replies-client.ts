import { GhClient, type GhClientLike } from './gh-client';
import { GithubCliError } from './github-errors';
import { buildReviewThreadReplyMutationArgs } from './pr-review-thread-mutations';
import { CodeflowReviewFixError } from '../review-comments/review-fix-errors';
import type { CodeflowReviewReplyResult } from '../review-comments/review-fix-payload';
import { truncateText } from '../utils/text';

export interface ReplyToReviewThreadOptions {
  cwd?: string;
  threadId: string;
  body: string;
  ghClient?: GhClientLike;
}

export async function replyToReviewThread(
  options: ReplyToReviewThreadOptions,
): Promise<CodeflowReviewReplyResult> {
  const cwd = options.cwd ?? process.cwd();
  const ghClient = options.ghClient ?? new GhClient({ cwd });

  try {
    const result = await ghClient.run(buildReviewThreadReplyMutationArgs({
      threadId: options.threadId,
      body: options.body,
    }));
    const parsed = parseReviewThreadMutationJson(
      result.stdout,
      'GitHub GraphQL returned invalid JSON for review-thread reply.',
    );
    throwOnReviewThreadGraphqlErrors(parsed, 'replying to review thread');
    const mutation = readReviewThreadMutationObject(parsed, 'addPullRequestReviewThreadReply');
    const comment = isJsonRecord(mutation.comment) ? mutation.comment : null;

    return {
      threadId: options.threadId,
      classification: 'valid',
      status: 'posted',
      commentId: readString(comment?.id),
      url: readString(comment?.url),
      body: options.body,
    };
  } catch (error) {
    throw mapGithubMutationError(error, 'replying to review thread');
  }
}

export function readReviewThreadMutationObject(
  parsed: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const data = isJsonRecord(parsed.data) ? parsed.data : null;
  const value = data?.[field];

  if (!isJsonRecord(value)) {
    throw new CodeflowReviewFixError({
      code: 'unexpected_response',
      message: `GitHub GraphQL response did not contain ${field} data.`,
      details: { outputPreview: truncateText(JSON.stringify(parsed), 1000) },
    });
  }

  return value;
}

export function throwOnReviewThreadGraphqlErrors(
  parsed: Record<string, unknown>,
  action: string,
): void {
  if (!Array.isArray(parsed.errors) || parsed.errors.length === 0) {
    return;
  }

  const text = JSON.stringify(parsed.errors).slice(0, 2000);

  if (looksLikePermissionDenied(text)) {
    throw new CodeflowReviewFixError({
      code: 'permission_denied',
      message: `GitHub denied access while ${action}.`,
      details: { errors: parsed.errors },
    });
  }

  if (looksLikeAlreadyResolved(text)) {
    throw new CodeflowReviewFixError({
      code: 'thread_already_resolved',
      message: 'GitHub reported the review thread is already resolved.',
      details: { errors: parsed.errors },
    });
  }

  if (looksLikeThreadNotFound(text)) {
    throw new CodeflowReviewFixError({
      code: 'thread_not_found',
      message: 'GitHub could not find the review thread.',
      details: { errors: parsed.errors },
    });
  }

  throw new CodeflowReviewFixError({
    code: 'graphql_failed',
    message: `GitHub GraphQL returned errors while ${action}.`,
    details: { errors: parsed.errors },
  });
}

export function mapGithubMutationError(
  error: unknown,
  action: string,
): CodeflowReviewFixError {
  if (error instanceof CodeflowReviewFixError) {
    return error;
  }

  if (!(error instanceof GithubCliError)) {
    return new CodeflowReviewFixError({
      code: 'mutation_failed',
      message: error instanceof Error ? error.message : `GitHub mutation failed while ${action}.`,
      cause: error,
    });
  }

  if (error.code === 'gh_missing') {
    return new CodeflowReviewFixError({
      code: 'gh_missing',
      message: error.message,
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (error.code === 'gh_auth_required') {
    return new CodeflowReviewFixError({
      code: 'gh_auth_required',
      message: error.message,
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  const text = `${error.stdout}\n${error.stderr}\n${error.message}`;

  if (looksLikePermissionDenied(text)) {
    return new CodeflowReviewFixError({
      code: 'permission_denied',
      message: `GitHub denied access while ${action}.`,
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (looksLikeAlreadyResolved(text)) {
    return new CodeflowReviewFixError({
      code: 'thread_already_resolved',
      message: 'GitHub reported the review thread is already resolved.',
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (looksLikeThreadNotFound(text)) {
    return new CodeflowReviewFixError({
      code: 'thread_not_found',
      message: 'GitHub could not find the review thread.',
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  return new CodeflowReviewFixError({
    code: 'mutation_failed',
    message: `GitHub mutation failed while ${action}.`,
    details: githubErrorDetails(error),
    cause: error,
  });
}

export function parseReviewThreadMutationJson(
  stdout: string,
  message: string,
): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch (error) {
    throw new CodeflowReviewFixError({
      code: 'unexpected_response',
      message,
      details: { outputPreview: truncateText(stdout, 1000) },
      cause: error,
    });
  }

  if (!isJsonRecord(parsed)) {
    throw new CodeflowReviewFixError({
      code: 'unexpected_response',
      message,
      details: { outputPreview: truncateText(stdout, 1000) },
    });
  }

  return parsed;
}

function looksLikePermissionDenied(value: string): boolean {
  return /permission denied|resource not accessible|forbidden|http\s+403|not authorized/i.test(value);
}

function looksLikeAlreadyResolved(value: string): boolean {
  return /already resolved|thread is resolved|cannot resolve.*resolved/i.test(value);
}

function looksLikeThreadNotFound(value: string): boolean {
  return /not found|could not resolve to a node|invalid node id|could not resolve/i.test(value);
}

function githubErrorDetails(error: GithubCliError): Record<string, unknown> {
  return {
    args: redactGraphqlArgs(error.args),
    exitCode: error.exitCode ?? null,
    stdout: truncateText(redactGraphqlArgText(error.stdout), 1000),
    stderr: truncateText(redactGraphqlArgText(error.stderr), 1000),
  };
}

function redactGraphqlArgs(args: string[]): string[] {
  return args.map((arg) => arg.startsWith('body=') ? 'body=<redacted>' : arg);
}

function redactGraphqlArgText(value: string): string {
  return value.replace(/body=[\s\S]*/g, 'body=<redacted>');
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
