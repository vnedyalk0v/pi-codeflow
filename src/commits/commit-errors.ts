import type { CodeflowCommitValidationIssue } from './commit-payload';

export type CodeflowCommitErrorCode =
  | 'invalid_arguments'
  | 'payload_file_not_found'
  | 'payload_file_unreadable'
  | 'invalid_payload_json'
  | 'invalid_payload'
  | 'commit_disabled'
  | 'reserved_branch'
  | 'no_staged_changes'
  | 'checks_failed'
  | 'checks_required'
  | 'template_unreadable'
  | 'unresolved_template_placeholder'
  | 'missing_commit_body'
  | 'git_status_failed'
  | 'git_commit_failed';

export interface CodeflowCommitErrorOptions {
  code: CodeflowCommitErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
  validationErrors?: CodeflowCommitValidationIssue[];
}

export class CodeflowCommitError extends Error {
  readonly code: CodeflowCommitErrorCode;
  readonly details?: Record<string, unknown>;
  readonly validationErrors?: CodeflowCommitValidationIssue[];

  constructor(options: CodeflowCommitErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'CodeflowCommitError';
    this.code = options.code;
    this.details = options.details;
    this.validationErrors = options.validationErrors;
  }
}
