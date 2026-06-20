export type CodeflowReviewCommentsErrorCode =
  | 'invalid_arguments'
  | 'gh_missing'
  | 'gh_auth_required'
  | 'repository_not_found'
  | 'permission_denied'
  | 'network_error'
  | 'no_pr_found'
  | 'pr_not_found'
  | 'graphql_failed'
  | 'pagination_failed'
  | 'unexpected_response'
  | 'review_comments_disabled'
  | 'triage_payload_file_not_found'
  | 'triage_payload_file_unreadable'
  | 'invalid_triage_payload_json'
  | 'invalid_triage_payload';

export interface CodeflowReviewCommentsErrorOptions {
  code: CodeflowReviewCommentsErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class CodeflowReviewCommentsError extends Error {
  readonly code: CodeflowReviewCommentsErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(options: CodeflowReviewCommentsErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'CodeflowReviewCommentsError';
    this.code = options.code;
    this.details = options.details;
  }
}
