import type { CodeflowReviewThread } from '../review-comments/review-thread';
import type { CodeflowReviewCommentTriageResult } from '../review-comments/review-thread-triage';
import { summarizeReviewCommentBody } from '../review-comments/review-thread-summary';
import { truncateText } from '../utils/text';
import { nowIso } from '../utils/time';

const MAX_STORED_THREADS = 50;
const MAX_STORED_COMMENT_SUMMARY_CHARS = 240;
const MAX_STORED_SUMMARY_CHARS = 2000;

export interface CodeflowStoredReviewCommentThread {
  threadId: string;
  path: string | null;
  line: number | null;
  isResolved: boolean;
  isOutdated: boolean;
  author: string | null;
  latestCommentSummary: string;
  classification?: string;
  requiresHumanDecision?: boolean;
  canResolveAfterChecks?: boolean;
}

export interface CodeflowStoredReviewCommentsRun {
  status: 'found' | 'none' | 'failed';
  prNumber: number | null;
  prUrl: string | null;
  unresolvedOnly: boolean;
  includeOutdated: boolean;
  fetchedThreadCount: number;
  filteredThreadCount: number;
  classificationCounts: Record<string, number>;
  requiresHumanDecisionCount: number;
  threads: CodeflowStoredReviewCommentThread[];
  threadIds?: string[];
  summary: string;
  checkedAt: string;
}

export interface CodeflowReviewCommentsState {
  lastRun: CodeflowStoredReviewCommentsRun | null;
}

export interface StoreReviewCommentsStateInput {
  status: 'found' | 'none' | 'failed';
  prNumber: number | null;
  prUrl: string | null;
  unresolvedOnly: boolean;
  includeOutdated: boolean;
  fetchedThreadCount: number;
  filteredThreadCount: number;
  threads: CodeflowReviewThread[];
  triage?: CodeflowReviewCommentTriageResult | null;
  summary: string;
  checkedAt?: string;
}

export function createInitialReviewCommentsState(): CodeflowReviewCommentsState {
  return {
    lastRun: null,
  };
}

export function updateReviewCommentsStateWithResult(
  state: CodeflowReviewCommentsState,
  input: StoreReviewCommentsStateInput,
): CodeflowReviewCommentsState {
  return {
    ...state,
    lastRun: toStoredReviewCommentsRun(input),
  };
}

export function toStoredReviewCommentsRun(
  input: StoreReviewCommentsStateInput,
): CodeflowStoredReviewCommentsRun {
  return {
    status: input.status,
    prNumber: input.prNumber,
    prUrl: input.prUrl,
    unresolvedOnly: input.unresolvedOnly,
    includeOutdated: input.includeOutdated,
    fetchedThreadCount: input.fetchedThreadCount,
    filteredThreadCount: input.filteredThreadCount,
    classificationCounts: { ...(input.triage?.classificationCounts ?? {}) },
    requiresHumanDecisionCount: input.triage?.requiresHumanDecisionCount ?? 0,
    threads: input.threads.slice(0, MAX_STORED_THREADS).map((thread) =>
      toStoredReviewCommentThread(thread, input.triage ?? null),
    ),
    threadIds: input.threads.map((thread) => thread.threadId),
    summary: truncateText(input.summary, MAX_STORED_SUMMARY_CHARS),
    checkedAt: input.checkedAt ?? nowIso(),
  };
}

function toStoredReviewCommentThread(
  thread: CodeflowReviewThread,
  triage: CodeflowReviewCommentTriageResult | null,
): CodeflowStoredReviewCommentThread {
  const triageThread = triage?.triage?.threads.find((item) => item.threadId === thread.threadId);
  const stored: CodeflowStoredReviewCommentThread = {
    threadId: thread.threadId,
    path: thread.path,
    line: thread.line,
    isResolved: thread.isResolved,
    isOutdated: thread.isOutdated,
    author: thread.author,
    latestCommentSummary: summarizeReviewCommentBody(
      thread.latestComment?.body ?? thread.firstComment?.body ?? '',
      MAX_STORED_COMMENT_SUMMARY_CHARS,
    ),
  };

  if (triageThread) {
    stored.classification = triageThread.classification;
    stored.requiresHumanDecision = triageThread.requiresHumanDecision;
    stored.canResolveAfterChecks = triageThread.canResolveAfterChecks;
  }

  return stored;
}
