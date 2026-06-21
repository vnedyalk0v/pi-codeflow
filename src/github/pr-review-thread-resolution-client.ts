import { GhClient, type GhClientLike } from './gh-client';
import { buildReviewThreadResolveMutationArgs } from './pr-review-thread-mutations';
import { mapGithubMutationError } from './pr-review-thread-replies-client';
import { CodeflowReviewFixError } from '../review-comments/review-fix-errors';
import type { CodeflowReviewResolutionResult } from '../review-comments/review-fix-payload';
import { parseJson } from '../utils/json';
import { truncateText } from '../utils/text';

export interface ResolveReviewThreadOptions {
  cwd?: string;
  threadId: string;
  ghClient?: GhClientLike;
}

export async function resolveReviewThread(
  options: ResolveReviewThreadOptions,
): Promise<CodeflowReviewResolutionResult> {
  const cwd = options.cwd ?? process.cwd();
  const ghClient = options.ghClient ?? new GhClient({ cwd });

  try {
    const result = await ghClient.run(buildReviewThreadResolveMutationArgs({
      threadId: options.threadId,
    }));
    const parsed = parseJsonObject(result.stdout, 'GitHub GraphQL returned invalid JSON for review-thread resolution.');
    throwOnGraphqlErrors(parsed);
    const mutation = readMutationObject(parsed, 'resolveReviewThread');
    const thread = isRecord(mutation.thread) ? mutation.thread : null;
    const resolved = thread?.isResolved === true;

    return {
      threadId: options.threadId,
      classification: 'valid',
      status: resolved ? 'resolved' : 'failed',
      resolved,
      ...(resolved ? {} : { reason: 'GitHub did not report the thread as resolved.' }),
    };
  } catch (error) {
    throw mapGithubMutationError(error, 'resolving review thread');
  }
}

function readMutationObject(parsed: Record<string, unknown>, field: string): Record<string, unknown> {
  const data = isRecord(parsed.data) ? parsed.data : null;
  const value = data?.[field];

  if (!isRecord(value)) {
    throw new CodeflowReviewFixError({
      code: 'unexpected_response',
      message: `GitHub GraphQL response did not contain ${field} data.`,
      details: { outputPreview: truncateText(JSON.stringify(parsed), 1000) },
    });
  }

  return value;
}

function throwOnGraphqlErrors(parsed: Record<string, unknown>): void {
  if (!Array.isArray(parsed.errors) || parsed.errors.length === 0) {
    return;
  }

  const text = JSON.stringify(parsed.errors).slice(0, 2000);

  if (/permission denied|resource not accessible|forbidden|http\s+403|not authorized/i.test(text)) {
    throw new CodeflowReviewFixError({
      code: 'permission_denied',
      message: 'GitHub denied access while resolving review thread.',
      details: { errors: parsed.errors },
    });
  }

  if (/already resolved|thread is resolved|cannot resolve.*resolved/i.test(text)) {
    throw new CodeflowReviewFixError({
      code: 'thread_already_resolved',
      message: 'GitHub reported the review thread is already resolved.',
      details: { errors: parsed.errors },
    });
  }

  if (/not found|could not resolve to a node|invalid node id|could not resolve/i.test(text)) {
    throw new CodeflowReviewFixError({
      code: 'thread_not_found',
      message: 'GitHub could not find the review thread.',
      details: { errors: parsed.errors },
    });
  }

  throw new CodeflowReviewFixError({
    code: 'graphql_failed',
    message: 'GitHub GraphQL returned errors while resolving review thread.',
    details: { errors: parsed.errors },
  });
}

function parseJsonObject(stdout: string, message: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = parseJson(stdout);
  } catch (error) {
    throw new CodeflowReviewFixError({
      code: 'unexpected_response',
      message,
      details: { outputPreview: truncateText(stdout, 1000) },
      cause: error,
    });
  }

  if (!isRecord(parsed)) {
    throw new CodeflowReviewFixError({
      code: 'unexpected_response',
      message,
      details: { outputPreview: truncateText(stdout, 1000) },
    });
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
