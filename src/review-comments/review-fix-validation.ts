import type { ValidateFunction } from 'ajv/dist/2020.js';

import type { CodeflowReviewCommentsConfig } from '../config/codeflow-config';
import type { CodeflowStoredReviewCommentThread } from '../state/review-comments-state';
import {
  createJsonSchemaValidator,
  mapJsonSchemaValidationErrors,
} from '../utils/schema-validation';
import {
  CODEFLOW_REVIEW_COMMENT_CLASSIFICATIONS,
  type CodeflowReviewCommentClassification,
} from './review-thread-triage';
import type {
  CodeflowReviewFixItem,
  CodeflowReviewFixPayload,
  CodeflowReviewFixValidationIssue,
  CodeflowReviewFixValidationResult,
} from './review-fix-payload';

const MAX_REPLY_BODY_CHARS = 4000;

export interface ValidateReviewFixPayloadOptions {
  knownThreads?: CodeflowStoredReviewCommentThread[];
  knownThreadIds?: string[];
  requireThreadMatch?: boolean;
  detached?: boolean;
  config?: Pick<CodeflowReviewCommentsConfig, 'requireChecksBeforeResolve' | 'requireHumanForInvalid'>;
  allowInvalidResolution?: boolean;
}

let cachedValidator: ValidateFunction | null = null;

export function validateReviewFixPayload(
  input: unknown,
  options: ValidateReviewFixPayloadOptions = {},
): CodeflowReviewFixValidationResult {
  const validator = getReviewFixPayloadValidator();

  if (!validator(input)) {
    return invalidResult(mapJsonSchemaValidationErrors(validator.errors ?? []));
  }

  const payload = structuredClone(input) as CodeflowReviewFixPayload;
  const semanticErrors = validateSemanticRules(payload, options);

  if (semanticErrors.length > 0) {
    return invalidResult(semanticErrors, payload);
  }

  return {
    valid: true,
    payload,
    errors: [],
    warnings: [],
    itemCount: payload.items.length,
  };
}

function getReviewFixPayloadValidator(): ValidateFunction {
  cachedValidator ??= createReviewFixPayloadValidator();
  return cachedValidator;
}

function createReviewFixPayloadValidator(): ValidateFunction {
  return createJsonSchemaValidator(new URL('../../schemas/review-comment-fix.schema.json', import.meta.url));
}

function validateSemanticRules(
  payload: CodeflowReviewFixPayload,
  options: ValidateReviewFixPayloadOptions,
): CodeflowReviewFixValidationIssue[] {
  const errors: CodeflowReviewFixValidationIssue[] = [];
  const requireChecksBeforeResolve = options.config?.requireChecksBeforeResolve ?? true;
  const requireHumanForInvalid = options.config?.requireHumanForInvalid ?? true;
  const allowInvalidResolution = options.allowInvalidResolution === true;
  const knownThreadIds = getKnownThreadIds(options);
  const knownThreadsById = new Map(
    (options.detached === true ? [] : options.knownThreads ?? []).map((thread) => [thread.threadId, thread]),
  );
  const seenThreadIds = new Set<string>();

  for (let index = 0; index < payload.items.length; index += 1) {
    const item = payload.items[index]!;
    const path = `/items/${index}`;

    if (!CODEFLOW_REVIEW_COMMENT_CLASSIFICATIONS.includes(item.classification)) {
      errors.push({
        path: `${path}/classification`,
        keyword: 'enum',
        message: 'classification must be one of the allowed review comment classifications',
        allowedValues: [...CODEFLOW_REVIEW_COMMENT_CLASSIFICATIONS],
      });
    }

    if (seenThreadIds.has(item.threadId)) {
      errors.push({
        path: `${path}/threadId`,
        keyword: 'duplicateThreadId',
        message: `threadId ${item.threadId} is duplicated in the review-fix payload`,
        details: { threadId: item.threadId },
      });
    }
    seenThreadIds.add(item.threadId);

    if (knownThreadIds && !knownThreadIds.has(item.threadId)) {
      errors.push({
        path: `${path}/threadId`,
        keyword: 'knownThreadId',
        message: `threadId ${item.threadId} does not match the latest /flow-comments state`,
        details: { threadId: item.threadId },
      });
    }

    const knownThread = knownThreadsById.get(item.threadId);

    if (options.detached !== true && knownThread && !hasStoredTriageMetadata(knownThread)) {
      errors.push({
        path: `${path}/threadId`,
        keyword: 'triageMetadataRequired',
        message: `threadId ${item.threadId} is missing stored triage metadata from the latest /flow-comments state`,
        details: { threadId: item.threadId },
      });
    }

    if (knownThread?.classification && knownThread.classification !== item.classification) {
      errors.push({
        path: `${path}/classification`,
        keyword: 'triageClassificationMatch',
        message: `classification ${item.classification} does not match latest triage classification ${knownThread.classification}`,
        details: {
          threadId: item.threadId,
          payloadClassification: item.classification,
          triageClassification: knownThread.classification,
        },
      });
    }

    if (knownThread?.requiresHumanDecision === true && item.resolveRequested) {
      errors.push({
        path: `${path}/resolveRequested`,
        keyword: 'triageRequiresHumanDecision',
        message: 'latest triage state requires a human decision, so resolution cannot be requested',
        details: { threadId: item.threadId },
      });
    }

    validateItemResolutionRules({
      errors,
      item,
      path,
      requireChecksBeforeResolve,
      requireHumanForInvalid,
      allowInvalidResolution,
    });

    validateItemReplyEvidenceRules({ errors, item, path, knownThread });
  }

  return errors;
}

function validateItemResolutionRules(options: {
  errors: CodeflowReviewFixValidationIssue[];
  item: CodeflowReviewFixItem;
  path: string;
  requireChecksBeforeResolve: boolean;
  requireHumanForInvalid: boolean;
  allowInvalidResolution: boolean;
}): void {
  const {
    errors,
    item,
    path,
    requireChecksBeforeResolve,
    requireHumanForInvalid,
    allowInvalidResolution,
  } = options;

  if (!item.resolveRequested) {
    return;
  }

  if (item.verification.length === 0) {
    errors.push({
      path: `${path}/verification`,
      keyword: 'verificationRequiredForResolve',
      message: 'verification must contain at least one item when resolution is requested',
    });
  }

  if (requireChecksBeforeResolve && item.checksRun.length === 0) {
    errors.push({
      path: `${path}/checksRun`,
      keyword: 'checksRequiredForResolve',
      message: 'checksRun must contain at least one item when resolution is requested and checks are required',
    });
  }

  if (item.classification === 'valid' && !item.commitSha) {
    errors.push({
      path: `${path}/commitSha`,
      keyword: 'commitShaRequiredForValidResolve',
      message: 'commitSha is required for valid findings when resolution is requested',
    });
  }

  if (item.classification === 'needs_human') {
    errors.push({
      path: `${path}/resolveRequested`,
      keyword: 'needsHumanCannotResolve',
      message: 'needs_human review threads must never request resolution',
    });
  }

  if (
    item.classification === 'invalid' &&
    requireHumanForInvalid &&
    !allowInvalidResolution
  ) {
    errors.push({
      path: `${path}/resolveRequested`,
      keyword: 'invalidResolutionRequiresPolicy',
      message: 'invalid review threads cannot request resolution unless invalid resolution is explicitly allowed',
    });
  }
}

function validateItemReplyEvidenceRules(options: {
  errors: CodeflowReviewFixValidationIssue[];
  item: CodeflowReviewFixItem;
  path: string;
  knownThread?: CodeflowStoredReviewCommentThread;
}): void {
  const { errors, item, path, knownThread } = options;
  const staleNeedsTextEvidence = item.classification === 'stale' && (
    knownThread?.isOutdated !== true || hasText(item.replyBody)
  );

  if (
    (['valid', 'already_fixed'].includes(item.classification) || staleNeedsTextEvidence) &&
    !hasText(item.fixSummary) &&
    (item.resolveRequested || hasText(item.replyBody))
  ) {
    errors.push({
      path: `${path}/fixSummary`,
      keyword: 'fixSummaryRequiredForReplyOrResolve',
      message: 'fixSummary is required for valid, already_fixed, and stale threads when replying or resolving',
    });
  }

  if (item.replyBody && item.replyBody.length > MAX_REPLY_BODY_CHARS) {
    errors.push({
      path: `${path}/replyBody`,
      keyword: 'maxLength',
      message: `replyBody must be at most ${MAX_REPLY_BODY_CHARS} characters`,
      details: { maxLength: MAX_REPLY_BODY_CHARS },
    });
  }
}

function hasStoredTriageMetadata(thread: CodeflowStoredReviewCommentThread): boolean {
  return hasText(thread.classification) && typeof thread.requiresHumanDecision === 'boolean';
}

function getKnownThreadIds(
  options: ValidateReviewFixPayloadOptions,
): Set<string> | null {
  if (options.detached === true || options.requireThreadMatch === false) {
    return null;
  }

  const ids = options.knownThreadIds ?? options.knownThreads?.map((thread) => thread.threadId);

  if (!ids) {
    return new Set();
  }

  return new Set(ids);
}

function invalidResult(
  errors: CodeflowReviewFixValidationIssue[],
  payload: CodeflowReviewFixPayload | null = null,
): CodeflowReviewFixValidationResult {
  return {
    valid: false,
    payload,
    errors,
    warnings: [],
    itemCount: payload?.items.length ?? 0,
  };
}

function hasText(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

export function isReviewFixClassification(
  value: unknown,
): value is CodeflowReviewCommentClassification {
  return typeof value === 'string' && CODEFLOW_REVIEW_COMMENT_CLASSIFICATIONS.includes(value as CodeflowReviewCommentClassification);
}
