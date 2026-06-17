import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Ajv2020, {
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';

import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import { cloneJson, isPlainObject, parseJson } from '../utils/json';
import { buildCommitTitle } from './commit-summary';
import type {
  CodeflowCommitPayload,
  CodeflowCommitValidationIssue,
  CodeflowCommitValidationResult,
} from './commit-payload';

export interface ValidateCommitPayloadOptions {
  config?: Pick<CodeflowConfig, 'commits'>;
  allowUnverified?: boolean;
}

const GENERIC_SUMMARIES = new Set(['update', 'changes', 'fix stuff', 'misc', 'wip']);
let cachedValidator: ValidateFunction | null = null;

export function validateCommitPayload(
  input: unknown,
  options: ValidateCommitPayloadOptions = {},
): CodeflowCommitValidationResult {
  const config = options.config ?? getDefaultCodeflowConfig();
  const validator = getCommitPayloadValidator();

  if (!validator(input)) {
    return {
      valid: false,
      errors: mapValidationErrors(validator.errors ?? []),
      warnings: [],
    };
  }

  const payload = normalizeCommitPayload(input as CodeflowCommitPayload);
  const errors = validateSemanticPayloadRules(payload, config, options.allowUnverified === true);
  const warnings = collectCommitPayloadWarnings(payload, config);

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

export function normalizeCommitPayload(payload: CodeflowCommitPayload): CodeflowCommitPayload {
  const normalized: CodeflowCommitPayload = {
    type: payload.type,
    summary: payload.summary.trim(),
    context: payload.context.trim(),
    changes: payload.changes.map((change) => change.trim()).filter(Boolean),
    verification: (payload.verification ?? [])
      .map((verification) => verification.trim())
      .filter(Boolean),
    risk: payload.risk?.trim() ?? '',
    refs: (payload.refs ?? []).map((ref) => ref.trim()).filter(Boolean),
  };

  if (payload.scope !== undefined) {
    normalized.scope = payload.scope.trim();
  }

  if (payload.breakingChange !== undefined) {
    normalized.breakingChange = payload.breakingChange.trim();
  }

  if (payload.footers !== undefined) {
    normalized.footers = normalizeFooters(payload.footers);
  }

  return normalized;
}

function validateSemanticPayloadRules(
  payload: CodeflowCommitPayload,
  config: Pick<CodeflowConfig, 'commits'>,
  allowUnverified: boolean,
): CodeflowCommitValidationIssue[] {
  const errors: CodeflowCommitValidationIssue[] = [];

  if (!config.commits.allowedTypes.includes(payload.type)) {
    errors.push({
      path: '/type',
      keyword: 'allowedCommitType',
      message: `/type must be one of the configured commit types: ${config.commits.allowedTypes.join(', ')}`,
      allowedValues: config.commits.allowedTypes,
      details: { type: payload.type },
    });
  }

  if (payload.summary.length === 0) {
    errors.push({ path: '/summary', keyword: 'required', message: '/summary is required' });
  }

  if (payload.context.length === 0) {
    errors.push({ path: '/context', keyword: 'required', message: '/context is required' });
  }

  if (payload.changes.length === 0) {
    errors.push({
      path: '/changes',
      keyword: 'minItems',
      message: '/changes must contain at least one item',
    });
  }

  if (/[.!?]$/.test(payload.summary)) {
    errors.push({
      path: '/summary',
      keyword: 'trailingPunctuation',
      message: '/summary must not end with trailing punctuation',
      details: { summary: payload.summary },
    });
  }

  if (GENERIC_SUMMARIES.has(normalizeSummaryForGenericCheck(payload.summary))) {
    errors.push({
      path: '/summary',
      keyword: 'genericSummary',
      message: '/summary is too generic; describe the concrete change',
      details: { summary: payload.summary },
    });
  }

  if (config.commits.requireVerification && !allowUnverified && (payload.verification?.length ?? 0) === 0) {
    errors.push({
      path: '/verification',
      keyword: 'minItems',
      message: '/verification must contain at least one item unless unverified commits are explicitly allowed',
    });
  }

  if (config.commits.requireRisk && (payload.risk?.length ?? 0) === 0) {
    errors.push({ path: '/risk', keyword: 'required', message: '/risk is required' });
  }

  const title = buildCommitTitle(payload, config);

  if (title.length > config.commits.maxTitleLength && config.commits.titleLengthPolicy === 'error') {
    errors.push({
      path: '/summary',
      keyword: 'maxTitleLength',
      message: `Rendered commit title is ${title.length} characters; maximum is ${config.commits.maxTitleLength}`,
      details: { title, maxTitleLength: config.commits.maxTitleLength },
    });
  }

  return errors;
}

function collectCommitPayloadWarnings(
  payload: CodeflowCommitPayload,
  config: Pick<CodeflowConfig, 'commits'>,
): string[] {
  const warnings: string[] = [];
  const title = buildCommitTitle(payload, config);

  if (title.length > config.commits.maxTitleLength && config.commits.titleLengthPolicy === 'warning') {
    warnings.push(
      `Rendered commit title is ${title.length} characters; configured maximum is ${config.commits.maxTitleLength}.`,
    );
  }

  if (/^[A-Z]/.test(payload.summary)) {
    warnings.push('Commit summary should be lower-case where natural.');
  }

  if (!config.commits.requireVerification && (payload.verification?.length ?? 0) === 0) {
    warnings.push('Commit payload does not include verification; config allows unverified commit payloads.');
  }

  if (!config.commits.requireRisk && (payload.risk?.length ?? 0) === 0) {
    warnings.push('Commit payload does not include risk; config allows risk to be omitted.');
  }

  return warnings;
}

function normalizeFooters(
  footers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const normalized: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(footers)) {
    const normalizedKey = key.trim();

    if (normalizedKey.length === 0) {
      continue;
    }

    if (Array.isArray(value)) {
      normalized[normalizedKey] = value.map((item) => item.trim()).filter(Boolean);
    } else {
      normalized[normalizedKey] = value.trim();
    }
  }

  return normalized;
}

function normalizeSummaryForGenericCheck(summary: string): string {
  return summary.trim().toLowerCase().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ');
}

function getCommitPayloadValidator(): ValidateFunction {
  cachedValidator ??= createCommitPayloadValidator();
  return cachedValidator;
}

function createCommitPayloadValidator(): ValidateFunction {
  const schemaText = readFileSync(getCommitPayloadSchemaPath(), 'utf8');
  const schema = parseJson(schemaText);
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  return ajv.compile(schema as AnySchema);
}

function getCommitPayloadSchemaPath(): string {
  return fileURLToPath(new URL('../../schemas/commit-payload.schema.json', import.meta.url));
}

function mapValidationErrors(errors: ErrorObject[]): CodeflowCommitValidationIssue[] {
  return errors.map((error) => {
    const path = getErrorPath(error);
    const allowedValues = getAllowedValues(error);
    const mappedError: CodeflowCommitValidationIssue = {
      path,
      keyword: error.keyword,
      message: getErrorMessage(error, path),
      details: cloneJson(error.params) as Record<string, unknown>,
    };

    if (allowedValues.length > 0) {
      mappedError.allowedValues = allowedValues;
    }

    return mappedError;
  });
}

function getErrorPath(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;

  if (error.keyword === 'required' && typeof params.missingProperty === 'string') {
    return joinJsonPointer(error.instancePath, params.missingProperty);
  }

  if (
    error.keyword === 'additionalProperties' &&
    typeof params.additionalProperty === 'string'
  ) {
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

  if (
    error.keyword === 'additionalProperties' &&
    typeof params.additionalProperty === 'string'
  ) {
    return `${path} is not allowed`;
  }

  if (isPlainObject(error.params) && typeof params.limit === 'number') {
    return `${path} ${error.message ?? 'is invalid'}`;
  }

  return error.message ?? `${path} is invalid`;
}
