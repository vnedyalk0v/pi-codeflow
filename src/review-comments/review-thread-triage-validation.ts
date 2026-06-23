import type { ValidateFunction } from 'ajv/dist/2020.js';

import {
  createJsonSchemaValidator,
  mapJsonSchemaValidationErrors,
} from '../utils/schema-validation';
import type { CodeflowReviewThread } from './review-thread';
import {
  CODEFLOW_REVIEW_COMMENT_CLASSIFICATIONS,
  countRequiresHumanDecision,
  countReviewCommentClassifications,
  createEmptyReviewCommentClassificationCounts,
  type CodeflowReviewCommentTriage,
  type CodeflowReviewCommentTriageResult,
  type CodeflowReviewCommentTriageValidationIssue,
} from './review-thread-triage';

export interface ValidateReviewCommentTriageOptions {
  fetchedThreads?: CodeflowReviewThread[];
  threadIds?: string[];
  requireThreadMatch?: boolean;
  requireAllThreadIds?: boolean;
}

let cachedValidator: ValidateFunction | null = null;

export function validateReviewCommentTriage(
  input: unknown,
  options: ValidateReviewCommentTriageOptions = {},
): CodeflowReviewCommentTriageResult {
  const validator = getReviewCommentTriageValidator();

  if (!validator(input)) {
    return invalidResult(mapJsonSchemaValidationErrors(validator.errors ?? []));
  }

  const triage = JSON.parse(JSON.stringify(input)) as CodeflowReviewCommentTriage;
  const semanticErrors = validateSemanticRules(triage, options);

  if (semanticErrors.length > 0) {
    return invalidResult(semanticErrors, triage);
  }

  return {
    valid: true,
    triage,
    errors: [],
    warnings: [],
    classificationCounts: countReviewCommentClassifications(triage),
    requiresHumanDecisionCount: countRequiresHumanDecision(triage),
    threadCount: triage.threads.length,
  };
}

function getReviewCommentTriageValidator(): ValidateFunction {
  cachedValidator ??= createReviewCommentTriageValidator();
  return cachedValidator;
}

function createReviewCommentTriageValidator(): ValidateFunction {
  return createJsonSchemaValidator(new URL('../../schemas/review-comment-triage.schema.json', import.meta.url));
}

function validateSemanticRules(
  triage: CodeflowReviewCommentTriage,
  options: ValidateReviewCommentTriageOptions,
): CodeflowReviewCommentTriageValidationIssue[] {
  const errors: CodeflowReviewCommentTriageValidationIssue[] = [];
  const allowedThreadIds = getAllowedThreadIds(options);
  const triagedThreadIds = new Set<string>();

  for (let index = 0; index < triage.threads.length; index += 1) {
    const thread = triage.threads[index]!;

    if (!CODEFLOW_REVIEW_COMMENT_CLASSIFICATIONS.includes(thread.classification)) {
      errors.push({
        path: `/threads/${index}/classification`,
        keyword: 'enum',
        message: 'classification must be one of the allowed review comment classifications',
        allowedValues: [...CODEFLOW_REVIEW_COMMENT_CLASSIFICATIONS],
      });
    }

    if (thread.classification === 'needs_human' && !thread.requiresHumanDecision) {
      errors.push({
        path: `/threads/${index}/requiresHumanDecision`,
        keyword: 'needsHumanRequiresHumanDecision',
        message: 'needs_human triage requires requiresHumanDecision: true',
      });
    }

    if (thread.classification === 'needs_human' && thread.canResolveAfterChecks) {
      errors.push({
        path: `/threads/${index}/canResolveAfterChecks`,
        keyword: 'needsHumanCannotResolve',
        message: 'needs_human triage requires canResolveAfterChecks: false',
      });
    }

    if (thread.requiresHumanDecision && thread.canResolveAfterChecks) {
      errors.push({
        path: `/threads/${index}/canResolveAfterChecks`,
        keyword: 'humanDecisionCannotResolve',
        message: 'requiresHumanDecision: true requires canResolveAfterChecks: false',
      });
    }

    if (triagedThreadIds.has(thread.threadId)) {
      errors.push({
        path: `/threads/${index}/threadId`,
        keyword: 'duplicateThreadId',
        message: `threadId ${thread.threadId} is duplicated in the triage payload`,
        details: { threadId: thread.threadId },
      });
    }

    triagedThreadIds.add(thread.threadId);

    if (allowedThreadIds && !allowedThreadIds.has(thread.threadId)) {
      errors.push({
        path: `/threads/${index}/threadId`,
        keyword: 'knownThreadId',
        message: `threadId ${thread.threadId} does not match a fetched review thread`,
        details: { threadId: thread.threadId },
      });
    }
  }

  if (options.requireAllThreadIds === true && allowedThreadIds) {
    for (const threadId of allowedThreadIds) {
      if (!triagedThreadIds.has(threadId)) {
        errors.push({
          path: '/threads',
          keyword: 'allSelectedThreadIds',
          message: `triage payload is missing selected review thread ${threadId}`,
          details: { threadId },
        });
      }
    }
  }

  return errors;
}

function getAllowedThreadIds(
  options: ValidateReviewCommentTriageOptions,
): Set<string> | null {
  if (options.requireThreadMatch === false) {
    return null;
  }

  const ids = options.threadIds ?? options.fetchedThreads?.map((thread) => thread.threadId);

  if (!ids) {
    return null;
  }

  return new Set(ids);
}

function invalidResult(
  errors: CodeflowReviewCommentTriageValidationIssue[],
  triage: CodeflowReviewCommentTriage | null = null,
): CodeflowReviewCommentTriageResult {
  return {
    valid: false,
    triage,
    errors,
    warnings: [],
    classificationCounts: triage
      ? countReviewCommentClassifications(triage)
      : createEmptyReviewCommentClassificationCounts(),
    requiresHumanDecisionCount: triage ? countRequiresHumanDecision(triage) : 0,
    threadCount: triage?.threads.length ?? 0,
  };
}
