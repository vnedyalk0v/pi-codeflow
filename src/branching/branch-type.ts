import type { CodeflowBranchType, CodeflowConfig } from '../config/codeflow-config';
import { BranchPolicyError } from './branch-errors';

export const BRANCH_TYPES = [
  'feat',
  'fix',
  'hotfix',
  'refactor',
  'perf',
  'docs',
  'test',
  'chore',
  'ci',
  'build',
  'revert',
] as const;

export type BranchType = CodeflowBranchType;

const BRANCH_TYPE_SET = new Set<string>(BRANCH_TYPES);

export function isBranchType(value: unknown): value is BranchType {
  return typeof value === 'string' && BRANCH_TYPE_SET.has(value);
}

export function validateBranchType(
  value: unknown,
  config: Pick<CodeflowConfig, 'branching'>,
): BranchType {
  if (!isBranchType(value) || !config.branching.allowedTypes.includes(value)) {
    throw new BranchPolicyError({
      code: 'invalid_branch_type',
      message: `Unsupported branch type: ${String(value)}. Allowed types: ${config.branching.allowedTypes.join(', ')}.`,
      details: {
        branchType: value,
        allowedTypes: config.branching.allowedTypes,
      },
    });
  }

  return value;
}
