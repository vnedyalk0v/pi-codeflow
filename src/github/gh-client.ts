import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GithubCliError } from './github-errors';

const execFileAsync = promisify(execFile);
const AUTH_REQUIRED_PATTERNS = [
  /\bnot logged (?:in|into)\b/i,
  /\bgh auth (?:login|refresh)\b/i,
  /\b(?:authentication|authorization)\s+(?:required|failed|needed|error|has failed)\b/i,
  /\b(?:requires?|need(?:s|ed)?)\s+(?:authentication|authorization)\b/i,
  /\b(?:bad|invalid) credentials\b/i,
  /\b(?:invalid|expired|revoked|missing|no)\s+(?:oauth\s+)?(?:token|credentials)\b/i,
  /\boauth\s+(?:token|authorization)\b/i,
  /\bHTTP\s+401\b/i,
];

export interface GhClientOptions {
  cwd?: string;
  timeoutMs?: number;
}

export interface GhCommandResult {
  stdout: string;
  stderr: string;
  args: string[];
}

export interface GhClientLike {
  run(args: string[]): Promise<GhCommandResult>;
}

export class GhClient implements GhClientLike {
  readonly cwd: string;
  readonly timeoutMs: number;

  constructor(options: GhClientOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async run(args: string[]): Promise<GhCommandResult> {
    try {
      const result = await execFileAsync('gh', args, {
        cwd: this.cwd,
        timeout: this.timeoutMs,
        maxBuffer: 1024 * 1024,
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        args,
      };
    } catch (error) {
      throw toGithubCliError(error, args);
    }
  }
}

function toGithubCliError(error: unknown, args: string[]): GithubCliError {
  const execError = error as {
    code?: number | string;
    errno?: number;
    syscall?: string;
    stdout?: string;
    stderr?: string;
    message?: string;
  };
  const stdout = execError.stdout ?? '';
  const stderr = execError.stderr ?? '';
  const messageText = `${stderr}\n${execError.message ?? ''}`;

  if (execError.code === 'ENOENT' || execError.syscall === 'spawn gh') {
    return new GithubCliError({
      code: 'gh_missing',
      message: 'GitHub CLI executable `gh` was not found on PATH.',
      args,
      exitCode: execError.code,
      stdout,
      stderr,
      cause: error,
    });
  }

  if (isGithubAuthRequiredMessage(messageText)) {
    return new GithubCliError({
      code: 'gh_auth_required',
      message: 'GitHub CLI authentication is required. Run `gh auth login` and retry.',
      args,
      exitCode: execError.code,
      stdout,
      stderr,
      cause: error,
    });
  }

  return new GithubCliError({
    code: 'gh_command_failed',
    message: stderr.trim() || execError.message || `gh ${args.join(' ')} failed`,
    args,
    exitCode: execError.code,
    stdout,
    stderr,
    cause: error,
  });
}

export function isGithubAuthRequiredMessage(messageText: string): boolean {
  return AUTH_REQUIRED_PATTERNS.some((pattern) => pattern.test(messageText));
}
