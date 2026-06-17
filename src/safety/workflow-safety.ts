import type { CodeflowConfig } from '../config/codeflow-config';
import { BranchPolicyError } from '../branching/branch-errors';
import { isReservedBranch } from './reserved-branch-policy';

export function assertWorkBranchIsNotReserved(
  workBranch: string,
  config: Pick<CodeflowConfig, 'reservedBranches'>,
): void {
  const [prefix] = workBranch.split('/');

  if (isReservedBranch(workBranch, config) || isReservedBranch(prefix, config)) {
    throw new BranchPolicyError({
      code: 'reserved_branch',
      message: `Codeflow work branch ${workBranch} is reserved and cannot be used for normal work.`,
      details: { workBranch },
    });
  }
}
