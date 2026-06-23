import path from 'node:path';

import { CodeflowCheckError } from './check-errors';
import type { CodeflowCheckConfig } from './check-result';

export interface ResolvedCodeflowCheckCommand {
  name: string;
  command: string;
  cwd: string;
  timeoutMs?: number;
  required: boolean;
}

const MAX_CHECK_TIMEOUT_MS = 3_600_000;

export function resolveCheckCommand(
  check: CodeflowCheckConfig,
  baseCwd: string,
): ResolvedCodeflowCheckCommand {
  const name = check.name?.trim();
  const command = check.command?.trim();

  if (!name) {
    throw new CodeflowCheckError({
      code: 'invalid_check_config',
      message: 'Codeflow check config requires a non-empty name.',
      details: { check },
    });
  }

  if (!command) {
    throw new CodeflowCheckError({
      code: 'invalid_check_config',
      message: `Codeflow check ${name} requires a non-empty command.`,
      details: { check },
    });
  }

  const timeoutMs = resolveTimeoutMs(check);

  return {
    name,
    command,
    cwd: resolveCheckCwd(baseCwd, check.cwd),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    required: check.required !== false,
  };
}

export function resolveCheckCwd(baseCwd: string, checkCwd?: string): string {
  if (!checkCwd || checkCwd.trim().length === 0) {
    return path.resolve(baseCwd);
  }

  return path.isAbsolute(checkCwd)
    ? path.resolve(checkCwd)
    : path.resolve(baseCwd, checkCwd);
}

export function resolveTimeoutMs(check: CodeflowCheckConfig): number | undefined {
  const timeoutMs = check.timeoutMs;

  if (
    timeoutMs !== undefined &&
    (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_CHECK_TIMEOUT_MS)
  ) {
    throw new CodeflowCheckError({
      code: 'invalid_check_config',
      message: `Codeflow check ${check.name} has an invalid timeout.`,
      details: { timeoutMs },
    });
  }

  return timeoutMs;
}
