export type CodeflowConfigLoadErrorCode =
  | 'file_not_found'
  | 'project_config_not_found'
  | 'invalid_json'
  | 'unreadable_file'
  | 'validation_failed';

export interface CodeflowConfigValidationError {
  path: string;
  message: string;
  keyword: string;
  allowedValues?: unknown[];
  details?: Record<string, unknown>;
}

export interface CodeflowConfigLoadErrorOptions {
  code: CodeflowConfigLoadErrorCode;
  message: string;
  path?: string;
  cause?: unknown;
  validationErrors?: CodeflowConfigValidationError[];
}

export class CodeflowConfigLoadError extends Error {
  readonly code: CodeflowConfigLoadErrorCode;
  readonly path?: string;
  readonly validationErrors?: CodeflowConfigValidationError[];

  constructor(options: CodeflowConfigLoadErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'CodeflowConfigLoadError';
    this.code = options.code;
    this.path = options.path;
    this.validationErrors = options.validationErrors;
  }
}
