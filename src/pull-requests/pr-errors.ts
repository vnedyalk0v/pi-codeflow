import type { CodeflowPrValidationIssue } from './pr-payload';

export type CodeflowPrErrorCode =
  | 'invalid_arguments'
  | 'payload_file_not_found'
  | 'payload_file_unreadable'
  | 'invalid_payload_json'
  | 'invalid_payload'
  | 'template_unreadable'
  | 'unresolved_template_placeholder'
  | 'missing_pr_body'
  | 'base_not_allowed'
  | 'missing_base_branch'
  | 'missing_head_branch'
  | 'reserved_branch'
  | 'base_equals_head'
  | 'git_status_failed'
  | 'checks_failed'
  | 'checks_required'
  | 'branch_not_pushed'
  | 'push_failed'
  | 'gh_missing'
  | 'gh_auth_required'
  | 'gh_pr_create_failed'
  | 'gh_pr_update_failed'
  | 'pr_already_exists';

export interface CodeflowPrErrorOptions {
  code: CodeflowPrErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
  validationErrors?: CodeflowPrValidationIssue[];
}

export class CodeflowPrError extends Error {
  readonly code: CodeflowPrErrorCode;
  readonly details?: Record<string, unknown>;
  readonly validationErrors?: CodeflowPrValidationIssue[];

  constructor(options: CodeflowPrErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'CodeflowPrError';
    this.code = options.code;
    this.details = options.details;
    this.validationErrors = options.validationErrors;
  }
}
