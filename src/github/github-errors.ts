export type GithubCliErrorCode = 'gh_missing' | 'gh_auth_required' | 'gh_command_failed';

export interface GithubCliErrorOptions {
  code: GithubCliErrorCode;
  message: string;
  args: string[];
  exitCode?: number | string | null;
  stdout?: string;
  stderr?: string;
  cause?: unknown;
}

export class GithubCliError extends Error {
  readonly code: GithubCliErrorCode;
  readonly args: string[];
  readonly exitCode?: number | string | null;
  readonly stdout: string;
  readonly stderr: string;

  constructor(options: GithubCliErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'GithubCliError';
    this.code = options.code;
    this.args = options.args;
    this.exitCode = options.exitCode;
    this.stdout = options.stdout ?? '';
    this.stderr = options.stderr ?? '';
  }
}
