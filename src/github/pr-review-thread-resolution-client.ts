import { GhClient, type GhClientLike } from './gh-client';
import { buildReviewThreadResolveMutationArgs } from './pr-review-thread-mutations';
import {
  isJsonRecord,
  mapGithubMutationError,
  parseReviewThreadMutationJson,
  readReviewThreadMutationObject,
  throwOnReviewThreadGraphqlErrors,
} from './pr-review-thread-replies-client';
import type { CodeflowReviewResolutionResult } from '../review-comments/review-fix-payload';

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
    const parsed = parseReviewThreadMutationJson(
      result.stdout,
      'GitHub GraphQL returned invalid JSON for review-thread resolution.',
    );
    throwOnReviewThreadGraphqlErrors(parsed, 'resolving review thread');
    const mutation = readReviewThreadMutationObject(parsed, 'resolveReviewThread');
    const thread = isJsonRecord(mutation.thread) ? mutation.thread : null;
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
