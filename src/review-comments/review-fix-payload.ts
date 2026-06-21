import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import type { CodeflowReviewCommentClassification } from './review-thread-triage';

export type CodeflowReviewFixClassification = CodeflowReviewCommentClassification;

export interface CodeflowReviewFixPayload {
  prNumber?: number;
  items: CodeflowReviewFixItem[];
}

export interface CodeflowReviewFixItem {
  threadId: string;
  classification: CodeflowReviewFixClassification;
  fixSummary?: string;
  verification: string[];
  checksRun: string[];
  commitSha?: string;
  replyBody?: string;
  resolveRequested: boolean;
  humanDecision?: string;
}

export interface CodeflowReviewFixValidationIssue {
  path: string;
  message: string;
  keyword: string;
  allowedValues?: unknown[];
  details?: Record<string, unknown>;
}

export interface CodeflowReviewFixValidationResult {
  valid: boolean;
  payload: CodeflowReviewFixPayload | null;
  errors: CodeflowReviewFixValidationIssue[];
  warnings: string[];
  itemCount: number;
}

export type CodeflowReviewFixActionStatus =
  | 'planned'
  | 'posted'
  | 'resolved'
  | 'skipped'
  | 'blocked'
  | 'failed';

export interface CodeflowReviewFixPolicyResult {
  threadId: string;
  classification: CodeflowReviewFixClassification;
  canReply: boolean;
  canResolve: boolean;
  requiresHumanDecision: boolean;
  shouldSkip: boolean;
  blockedReasons: string[];
  warnings: string[];
}

export interface CodeflowReviewReplyResult {
  threadId: string;
  classification: CodeflowReviewFixClassification;
  status: Exclude<CodeflowReviewFixActionStatus, 'resolved'>;
  commentId: string | null;
  url: string | null;
  body: string | null;
  reason?: string;
}

export interface CodeflowReviewResolutionResult {
  threadId: string;
  classification: CodeflowReviewFixClassification;
  status: Exclude<CodeflowReviewFixActionStatus, 'posted'>;
  resolved: boolean;
  reason?: string;
}

export type CodeflowReviewFixResultStatus = 'applied' | 'dry_run' | 'blocked' | 'failed';

export interface CodeflowReviewFixResult {
  status: CodeflowReviewFixResultStatus;
  prNumber: number | null;
  replies: CodeflowReviewReplyResult[];
  resolutions: CodeflowReviewResolutionResult[];
  blocked: CodeflowReviewFixBlockedItem[];
  requiresHumanDecision: string[];
  summary: string;
  warnings: string[];
  lifecyclePhase: CodeflowLifecyclePhase;
  nextExpectedActions: string[];
}

export interface CodeflowReviewFixBlockedItem {
  threadId: string;
  classification: string;
  reason: string;
}

export interface CodeflowRenderedReviewReply {
  threadId: string;
  classification: CodeflowReviewFixClassification;
  body: string;
  templatePath: string | null;
  usedDefaultTemplate: boolean;
  warnings: string[];
}
