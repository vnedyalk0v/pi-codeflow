export type GitErrorCode =
  | 'git_command_failed'
  | 'not_git_repository'
  | 'branch_not_found'
  | 'branch_exists';

export interface GitErrorOptions {
  code: GitErrorCode;
  message: string;
  command?: string;
  args?: string[];
  exitCode?: number | string;
  stdout?: string;
  stderr?: string;
  cause?: unknown;
}

export class GitError extends Error {
  readonly code: GitErrorCode;
  readonly command?: string;
  readonly args?: string[];
  readonly exitCode?: number | string;
  readonly stdout?: string;
  readonly stderr?: string;

  constructor(options: GitErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'GitError';
    this.code = options.code;
    this.command = options.command;
    this.args = options.args;
    this.exitCode = options.exitCode;
    this.stdout = options.stdout;
    this.stderr = options.stderr;
  }
}
