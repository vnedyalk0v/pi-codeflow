import { readFileSync } from 'node:fs';

import Ajv2020, {
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';

export interface JsonSchemaValidationIssue {
  path: string;
  message: string;
  keyword: string;
  allowedValues?: unknown[];
  details?: Record<string, unknown>;
}

export function createJsonSchemaValidator(schemaUrl: URL | string): ValidateFunction {
  const schemaText = readFileSync(schemaUrl, 'utf8');
  const schema = JSON.parse(schemaText);
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  return ajv.compile(schema as AnySchema);
}

export function mapJsonSchemaValidationErrors<T extends JsonSchemaValidationIssue>(
  errors: ErrorObject[],
): T[] {
  return errors.map((error) => {
    const path = getErrorPath(error);
    const allowedValues = getAllowedValues(error);
    const issue: JsonSchemaValidationIssue = {
      path,
      keyword: error.keyword,
      message: getErrorMessage(error, path),
      details: structuredClone(error.params) as Record<string, unknown>,
    };

    if (allowedValues.length > 0) {
      issue.allowedValues = allowedValues;
    }

    return issue as T;
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

  if (typeof params.limit === 'number') {
    return `${path} ${error.message ?? 'is invalid'}`;
  }

  return error.message ?? `${path} is invalid`;
}
