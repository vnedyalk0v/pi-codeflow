import type { CodeflowConfig } from '../config/codeflow-config';

export const DEFAULT_RESERVED_BRANCHES = [
  'main',
  'master',
  'dev',
  'develop',
  'stage',
  'staging',
  'release',
  'production',
] as const;

export function getReservedBranches(
  config?: Pick<CodeflowConfig, 'reservedBranches'>,
): string[] {
  return [...new Set([...DEFAULT_RESERVED_BRANCHES, ...(config?.reservedBranches ?? [])])];
}

export function isReservedBranch(
  branchName: string | null | undefined,
  config?: Pick<CodeflowConfig, 'reservedBranches'>,
): boolean {
  if (!branchName) {
    return false;
  }

  return getReservedBranches(config).includes(branchName);
}
