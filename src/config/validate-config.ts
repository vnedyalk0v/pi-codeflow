import { readFileSync } from 'node:fs';

import Ajv2020, {
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';

import type { CodeflowConfig } from './codeflow-config';
import type { CodeflowConfigValidationError } from './config-errors';
import { getCodeflowSchemaPath } from './config-paths';
import { cloneJson, isPlainObject, parseJson } from '../utils/json';

export type CodeflowConfigValidationResult =
  | {
      valid: true;
      config: CodeflowConfig;
      warnings: string[];
    }
  | {
      valid: false;
      errors: CodeflowConfigValidationError[];
    };

let cachedValidator: ValidateFunction | null = null;

export function validateCodeflowConfig(input: unknown): CodeflowConfigValidationResult {
  const validator = getCodeflowConfigValidator();

  if (!validator(input)) {
    return {
      valid: false,
      errors: mapValidationErrors(validator.errors ?? []),
    };
  }

  const config = cloneJson(input) as CodeflowConfig;
  const semanticErrors = validateSemanticConfigRules(config);

  if (semanticErrors.length > 0) {
    return {
      valid: false,
      errors: semanticErrors,
    };
  }

  return {
    valid: true,
    config,
    warnings: collectValidationWarnings(input),
  };
}

function getCodeflowConfigValidator(): ValidateFunction {
  cachedValidator ??= createCodeflowConfigValidator();
  return cachedValidator;
}

function createCodeflowConfigValidator(): ValidateFunction {
  const schemaText = readFileSync(getCodeflowSchemaPath(), 'utf8');
  const schema = parseJson(schemaText);
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  return ajv.compile(schema as AnySchema);
}

function mapValidationErrors(errors: ErrorObject[]): CodeflowConfigValidationError[] {
  return errors.map((error) => {
    const path = getErrorPath(error);
    const allowedValues = getAllowedValues(error);
    const mappedError: CodeflowConfigValidationError = {
      path,
      keyword: error.keyword,
      message: getErrorMessage(error, path),
      details: { ...error.params },
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

  if (error.keyword === 'if') {
    return `${path} failed a conditional schema requirement`;
  }

  return error.message ?? `${path} is invalid`;
}

function validateSemanticConfigRules(
  config: CodeflowConfig,
): CodeflowConfigValidationError[] {
  const errors: CodeflowConfigValidationError[] = [];

  if (!config.baseBranches.allowed.includes(config.pullRequest.baseBranch)) {
    errors.push({
      path: '/pullRequest/baseBranch',
      keyword: 'allowedBaseBranch',
      message: '/pullRequest/baseBranch must be listed in /baseBranches/allowed',
      allowedValues: config.baseBranches.allowed,
      details: {
        baseBranch: config.pullRequest.baseBranch,
      },
    });
  }

  return errors;
}

function collectValidationWarnings(input: unknown): string[] {
  if (!isPlainObject(input) || !('extends' in input)) {
    return [];
  }

  return [
    'The extends field is reserved for a future Codeflow milestone and is not resolved by schema validation.',
  ];
}
