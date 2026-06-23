import type { ValidateFunction } from 'ajv/dist/2020.js';

import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import { redactSecrets } from '../utils/redaction';
import {
  createJsonSchemaValidator,
  mapJsonSchemaValidationErrors,
} from '../utils/schema-validation';
import type {
  CodeflowPrBodyPayload,
  CodeflowPrPayload,
  CodeflowPrTitlePayload,
  CodeflowPrValidationIssue,
  CodeflowPrValidationResult,
} from './pr-payload';
import { renderPrTitle } from './pr-summary';

export interface ValidatePrPayloadOptions {
  config?: Pick<CodeflowConfig, 'branching' | 'pullRequest'>;
  allowUnverified?: boolean;
}

let cachedValidator: ValidateFunction | null = null;

export function validatePrPayload(
  input: unknown,
  options: ValidatePrPayloadOptions = {},
): CodeflowPrValidationResult {
  const config = options.config ?? getDefaultCodeflowConfig();
  const validator = getPrPayloadValidator();

  if (!validator(input)) {
    return {
      valid: false,
      errors: mapJsonSchemaValidationErrors(validator.errors ?? []),
      warnings: [],
    };
  }

  const payload = normalizePrPayload(input as CodeflowPrPayload);
  const errors = validateSemanticPayloadRules(payload, config, options.allowUnverified === true);
  const warnings = collectPrPayloadWarnings(payload, config, options.allowUnverified === true);

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  return {
    valid: true,
    payload,
    warnings,
  };
}

export function normalizePrPayload(payload: CodeflowPrPayload): CodeflowPrPayload {
  const normalized: CodeflowPrPayload = {
    title: normalizeTitle(payload.title),
    body: normalizeBody(payload.body),
  };

  if (payload.draft !== undefined) {
    normalized.draft = payload.draft;
  }

  if (payload.baseBranch !== undefined) {
    normalized.baseBranch = payload.baseBranch.trim();
  }

  if (payload.headBranch !== undefined) {
    normalized.headBranch = payload.headBranch.trim();
  }

  return normalized;
}

function normalizeTitle(title: CodeflowPrTitlePayload): CodeflowPrTitlePayload {
  const normalized: CodeflowPrTitlePayload = {
    type: title.type,
    summary: title.summary.trim(),
  };

  if (title.scope !== undefined) {
    normalized.scope = title.scope.trim();
  }

  if (title.ticket !== undefined) {
    normalized.ticket = title.ticket.trim();
  }

  return normalized;
}

function normalizeBody(body: CodeflowPrBodyPayload): CodeflowPrBodyPayload {
  const normalized: CodeflowPrBodyPayload = {
    summary: body.summary.trim(),
    context: body.context.trim(),
    changes: body.changes.map((change) => change.trim()).filter(Boolean),
    verification: (body.verification ?? [])
      .map((verification) => verification.trim())
      .filter(Boolean),
    selfReview: (body.selfReview ?? [])
      .map((selfReview) => selfReview.trim())
      .filter(Boolean),
    risk: body.risk.trim(),
    rollback: body.rollback.trim(),
    refs: (body.refs ?? []).map((ref) => ref.trim()).filter(Boolean),
  };

  if (body.reviewerNotes !== undefined) {
    normalized.reviewerNotes = body.reviewerNotes.trim();
  }

  return normalized;
}

function validateSemanticPayloadRules(
  payload: CodeflowPrPayload,
  config: Pick<CodeflowConfig, 'branching' | 'pullRequest'>,
  allowUnverified: boolean,
): CodeflowPrValidationIssue[] {
  const errors: CodeflowPrValidationIssue[] = [];

  if (!config.branching.allowedTypes.includes(payload.title.type)) {
    errors.push({
      path: '/title/type',
      keyword: 'allowedPrType',
      message: `/title/type must be one of the configured PR title types: ${config.branching.allowedTypes.join(', ')}`,
      allowedValues: config.branching.allowedTypes,
      details: { type: payload.title.type },
    });
  }

  if (payload.title.summary.length === 0) {
    errors.push({ path: '/title/summary', keyword: 'required', message: '/title/summary is required' });
  }

  if (payload.body.summary.length === 0) {
    errors.push({ path: '/body/summary', keyword: 'required', message: '/body/summary is required' });
  }

  if (payload.body.context.length === 0) {
    errors.push({ path: '/body/context', keyword: 'required', message: '/body/context is required' });
  }

  if (payload.body.changes.length === 0) {
    errors.push({
      path: '/body/changes',
      keyword: 'minItems',
      message: '/body/changes must contain at least one item',
    });
  }

  if (payload.body.risk.length === 0) {
    errors.push({ path: '/body/risk', keyword: 'required', message: '/body/risk is required' });
  }

  if (payload.body.rollback.length === 0) {
    errors.push({ path: '/body/rollback', keyword: 'required', message: '/body/rollback is required' });
  }

  if (
    config.pullRequest.requireVerification &&
    !allowUnverified &&
    (payload.body.verification?.length ?? 0) === 0
  ) {
    errors.push({
      path: '/body/verification',
      keyword: 'minItems',
      message: '/body/verification must contain at least one item unless unverified PRs are explicitly allowed',
    });
  }

  if (config.pullRequest.requireSelfReview && (payload.body.selfReview?.length ?? 0) === 0) {
    errors.push({
      path: '/body/selfReview',
      keyword: 'minItems',
      message: '/body/selfReview must contain at least one item unless PR self-review is disabled in config',
    });
  }

  const title = renderPrTitle(payload.title, config);

  if (
    title.length > config.pullRequest.maxTitleLength &&
    config.pullRequest.titleLengthPolicy === 'error'
  ) {
    errors.push({
      path: '/title/summary',
      keyword: 'maxTitleLength',
      message: `Rendered PR title is ${title.length} characters; maximum is ${config.pullRequest.maxTitleLength}`,
      details: { title: redactSecrets(title), maxTitleLength: config.pullRequest.maxTitleLength },
    });
  }

  return errors;
}

function collectPrPayloadWarnings(
  payload: CodeflowPrPayload,
  config: Pick<CodeflowConfig, 'pullRequest'>,
  allowUnverified: boolean,
): string[] {
  const warnings: string[] = [];
  const title = renderPrTitle(payload.title, config);

  if (
    title.length > config.pullRequest.maxTitleLength &&
    config.pullRequest.titleLengthPolicy === 'warning'
  ) {
    warnings.push(
      `Rendered PR title is ${title.length} characters; configured maximum is ${config.pullRequest.maxTitleLength}.`,
    );
  }

  if (!config.pullRequest.requireVerification && (payload.body.verification?.length ?? 0) === 0) {
    warnings.push('PR payload does not include verification; config allows unverified PR payloads.');
  }

  if (allowUnverified && (payload.body.verification?.length ?? 0) === 0) {
    warnings.push('PR payload does not include verification; --allow-unverified was provided.');
  }

  if (!config.pullRequest.requireSelfReview && (payload.body.selfReview?.length ?? 0) === 0) {
    warnings.push('PR payload does not include self-review; config allows self-review to be omitted.');
  }

  return warnings;
}

function getPrPayloadValidator(): ValidateFunction {
  cachedValidator ??= createPrPayloadValidator();
  return cachedValidator;
}

function createPrPayloadValidator(): ValidateFunction {
  return createJsonSchemaValidator(new URL('../../schemas/pr-payload.schema.json', import.meta.url));
}
