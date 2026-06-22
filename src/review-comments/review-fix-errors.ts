export type CodeflowReviewFixErrorCode =
  | 'invalid_arguments'
  | 'invalid_payload'
  | 'payload_file_not_found'
  | 'payload_file_unreadable'
  | 'invalid_payload_json'
  | 'review_comments_disabled'
  | 'missing_review_comments_state'
  | 'incomplete_review_comments_state'
  | 'policy_blocked'
  | 'template_unreadable'
  | 'unresolved_template_placeholder'
  | 'gh_missing'
  | 'gh_auth_required'
  | 'permission_denied'
  | 'thread_not_found'
  | 'thread_already_resolved'
  | 'graphql_failed'
  | 'unexpected_response'
  | 'mutation_failed';

export interface CodeflowReviewFixErrorOptions {
  code: CodeflowReviewFixErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class CodeflowReviewFixError extends Error {
  readonly code: CodeflowReviewFixErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(options: CodeflowReviewFixErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'CodeflowReviewFixError';
    this.code = options.code;
    this.details = options.details;
  }
}
