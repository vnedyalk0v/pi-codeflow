import { readFileSync } from 'node:fs';

import Ajv2020, { type AnySchema, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';

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
    return invalidResult(mapValidationErrors(validator.errors ?? []));
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
  const schemaText = readFileSync(
    new URL('../../schemas/review-comment-triage.schema.json', import.meta.url),
    'utf8',
  );
  const schema = JSON.parse(schemaText);
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  return ajv.compile(schema as AnySchema);
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

function mapValidationErrors(errors: ErrorObject[]): CodeflowReviewCommentTriageValidationIssue[] {
  return errors.map((error) => {
    const path = getErrorPath(error);
    const issue: CodeflowReviewCommentTriageValidationIssue = {
      path,
      keyword: error.keyword,
      message: getErrorMessage(error, path),
      details: { ...error.params },
    };
    const allowedValues = getAllowedValues(error);

    if (allowedValues.length > 0) {
      issue.allowedValues = allowedValues;
    }

    return issue;
  });
}

function getErrorPath(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;

  if (error.keyword === 'required' && typeof params.missingProperty === 'string') {
    return joinJsonPointer(error.instancePath, params.missingProperty);
  }

  if (error.keyword === 'additionalProperties' && typeof params.additionalProperty === 'string') {
    return joinJsonPointer(error.instancePath, params.additionalProperty);
  }

  return error.instancePath || '/';
}

function joinJsonPointer(basePath: string, segment: string): string {
  const escapedSegment = segment.replaceAll('~', '~0').replaceAll('/', '~1');
  return `${basePath || ''}/${escapedSegment}`;
}

function getAllowedValues(error: ErrorObject): unknown[] {
  const params = error.params as Record<string, unknown>;

  if (Array.isArray(params.allowedValues)) {
    return params.allowedValues;
  }

  if ('allowedValue' in params) {
    return [params.allowedValue];
  }

  return [];
}

function getErrorMessage(error: ErrorObject, path: string): string {
  const params = error.params as Record<string, unknown>;

  if (error.keyword === 'required' && typeof params.missingProperty === 'string') {
    return `${path} is required`;
  }

  if (error.keyword === 'additionalProperties' && typeof params.additionalProperty === 'string') {
    return `${path} is not allowed`;
  }

  if (error.keyword === 'if') {
    return `${path} failed a conditional schema requirement`;
  }

  return error.message ?? `${path} is invalid`;
}
