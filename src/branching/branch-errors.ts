export type BranchPolicyErrorCode =
  | 'invalid_branch_type'
  | 'invalid_ticket_pattern'
  | 'branch_template_not_found'
  | 'empty_branch_slug'
  | 'branch_name_collision'
  | 'reserved_branch';

export interface BranchPolicyErrorOptions {
  code: BranchPolicyErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class BranchPolicyError extends Error {
  readonly code: BranchPolicyErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(options: BranchPolicyErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'BranchPolicyError';
    this.code = options.code;
    this.details = options.details;
  }
}
