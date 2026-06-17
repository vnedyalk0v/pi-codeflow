export type CodeflowCheckErrorCode = 'invalid_check_config' | 'invalid_arguments';

export interface CodeflowCheckErrorOptions {
  code: CodeflowCheckErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class CodeflowCheckError extends Error {
  readonly code: CodeflowCheckErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(options: CodeflowCheckErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'CodeflowCheckError';
    this.code = options.code;
    this.details = options.details;
  }
}
