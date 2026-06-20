export const CODEFLOW_REVIEW_COMMENT_CLASSIFICATIONS = [
  'valid',
  'invalid',
  'stale',
  'already_fixed',
  'needs_human',
] as const;

export type CodeflowReviewCommentClassification =
  (typeof CODEFLOW_REVIEW_COMMENT_CLASSIFICATIONS)[number];

export interface CodeflowReviewCommentTriageThread {
  threadId: string;
  classification: CodeflowReviewCommentClassification;
  confidence: number;
  reason: string;
  recommendedAction: string;
  filesToInspect: string[];
  filesToChange: string[];
  checksToRun: string[];
  replyBody: string;
  canResolveAfterChecks: boolean;
  requiresHumanDecision: boolean;
}

export interface CodeflowReviewCommentTriage {
  threads: CodeflowReviewCommentTriageThread[];
}

export interface CodeflowReviewCommentTriageValidationIssue {
  path: string;
  message: string;
  keyword: string;
  allowedValues?: unknown[];
  details?: Record<string, unknown>;
}

export interface CodeflowReviewCommentTriageResult {
  valid: boolean;
  triage: CodeflowReviewCommentTriage | null;
  errors: CodeflowReviewCommentTriageValidationIssue[];
  warnings: string[];
  classificationCounts: Record<CodeflowReviewCommentClassification, number>;
  requiresHumanDecisionCount: number;
  threadCount: number;
}

export function createEmptyReviewCommentClassificationCounts(): Record<CodeflowReviewCommentClassification, number> {
  return {
    valid: 0,
    invalid: 0,
    stale: 0,
    already_fixed: 0,
    needs_human: 0,
  };
}

export function countReviewCommentClassifications(
  triage: CodeflowReviewCommentTriage | null,
): Record<CodeflowReviewCommentClassification, number> {
  const counts = createEmptyReviewCommentClassificationCounts();

  for (const thread of triage?.threads ?? []) {
    counts[thread.classification] += 1;
  }

  return counts;
}

export function countRequiresHumanDecision(
  triage: CodeflowReviewCommentTriage | null,
): number {
  return (triage?.threads ?? []).filter((thread) => thread.requiresHumanDecision).length;
}
