export type GithubCliErrorCode = 'gh_missing' | 'gh_auth_required' | 'gh_command_failed';

export type CodeflowPrChecksErrorCode =
  | 'invalid_arguments'
  | 'gh_missing'
  | 'gh_auth_required'
  | 'no_pr_found'
  | 'pr_not_found'
  | 'repository_not_found'
  | 'permission_denied'
  | 'network_error'
  | 'no_checks_found'
  | 'checks_timeout'
  | 'unknown_json'
  | 'gh_command_failed';

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

export interface CodeflowPrChecksErrorOptions {
  code: CodeflowPrChecksErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class CodeflowPrChecksError extends Error {
  readonly code: CodeflowPrChecksErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(options: CodeflowPrChecksErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'CodeflowPrChecksError';
    this.code = options.code;
    this.details = options.details;
  }
}
