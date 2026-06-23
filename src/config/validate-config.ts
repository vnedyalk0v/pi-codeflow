import type { ValidateFunction } from 'ajv/dist/2020.js';

import type { CodeflowConfig } from './codeflow-config';
import type { CodeflowConfigValidationError } from './config-errors';
import { getCodeflowSchemaPath } from './config-paths';
import {
  createJsonSchemaValidator,
  mapJsonSchemaValidationErrors,
} from '../utils/schema-validation';

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
      errors: mapJsonSchemaValidationErrors(validator.errors ?? []),
    };
  }

  const config = structuredClone(input) as CodeflowConfig;
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
    warnings: [],
  };
}

function getCodeflowConfigValidator(): ValidateFunction {
  cachedValidator ??= createCodeflowConfigValidator();
  return cachedValidator;
}

function createCodeflowConfigValidator(): ValidateFunction {
  return createJsonSchemaValidator(getCodeflowSchemaPath());
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

  if (!config.branching.allowedTypes.includes(config.branching.defaultType)) {
    errors.push({
      path: '/branching/defaultType',
      keyword: 'allowedBranchType',
      message: '/branching/defaultType must be listed in /branching/allowedTypes',
      allowedValues: config.branching.allowedTypes,
      details: {
        defaultType: config.branching.defaultType,
      },
    });
  }

  return errors;
}
