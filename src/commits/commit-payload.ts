import type { CodeflowBranchType } from '../config/codeflow-config';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';

export type CodeflowCommitType = CodeflowBranchType;

export interface CodeflowCommitPayload {
  type: CodeflowCommitType;
  scope?: string;
  summary: string;
  context: string;
  changes: string[];
  verification: string[];
  risk: string;
  refs?: string[];
  breakingChange?: string;
  footers?: Record<string, string | string[]>;
}

export interface CodeflowCommitValidationIssue {
  path: string;
  message: string;
  keyword: string;
  allowedValues?: unknown[];
  details?: Record<string, unknown>;
}

export type CodeflowCommitValidationResult =
  | {
      valid: true;
      payload: CodeflowCommitPayload;
      warnings: string[];
    }
  | {
      valid: false;
      errors: CodeflowCommitValidationIssue[];
      warnings: string[];
    };

export interface CodeflowCommitMessage {
  title: string;
  body: string;
  message: string;
  templatePath: string | null;
  usedDefaultTemplate: boolean;
  warnings: string[];
}

export interface CodeflowCommitResult {
  status: 'committed' | 'dry_run' | 'failed';
  commitSha: string | null;
  branch: string | null;
  title: string;
  message: string;
  payload: CodeflowCommitPayload;
  warnings: string[];
  validationWarnings: string[];
  lifecyclePhase: CodeflowLifecyclePhase;
}
