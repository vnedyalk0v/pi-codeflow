import type { CodeflowBranchType } from '../config/codeflow-config';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';

export type CodeflowPrType = CodeflowBranchType;

export interface CodeflowPrTitlePayload {
  type: CodeflowPrType;
  scope?: string;
  summary: string;
  ticket?: string;
}

export interface CodeflowPrBodyPayload {
  summary: string;
  context: string;
  changes: string[];
  verification?: string[];
  selfReview?: string[];
  risk: string;
  rollback: string;
  reviewerNotes?: string;
  refs?: string[];
}

export interface CodeflowPrPayload {
  title: CodeflowPrTitlePayload;
  body: CodeflowPrBodyPayload;
  draft?: boolean;
  baseBranch?: string;
  headBranch?: string;
}

export interface CodeflowPrValidationIssue {
  path: string;
  message: string;
  keyword: string;
  allowedValues?: unknown[];
  details?: Record<string, unknown>;
}

export type CodeflowPrValidationResult =
  | {
      valid: true;
      payload: CodeflowPrPayload;
      warnings: string[];
    }
  | {
      valid: false;
      errors: CodeflowPrValidationIssue[];
      warnings: string[];
    };

export interface CodeflowPrRenderResult {
  title: string;
  body: string;
  templatePath: string | null;
  usedDefaultTemplate: boolean;
  warnings: string[];
}

export interface CodeflowPrResult {
  status: 'created' | 'dry_run' | 'failed';
  prUrl: string | null;
  prNumber: number | null;
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
  payload: CodeflowPrPayload;
  warnings: string[];
  validationWarnings: string[];
  lifecyclePhase: CodeflowLifecyclePhase;
  draft: boolean;
  updatedExisting: boolean;
}
