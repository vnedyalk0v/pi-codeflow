import type {
  CodeflowReviewFixBlockedItem,
  CodeflowReviewFixResultStatus,
  CodeflowReviewReplyResult,
  CodeflowReviewResolutionResult,
} from '../review-comments/review-fix-payload';
import { truncateText } from '../utils/text';
import { nowIso } from '../utils/time';

const MAX_STORED_OUTCOMES = 50;
const MAX_STORED_SUMMARY_CHARS = 2000;

export interface CodeflowStoredReviewFixReply {
  threadId: string;
  classification: string;
  commentId: string | null;
  url: string | null;
}

export interface CodeflowStoredReviewFixResolution {
  threadId: string;
  classification: string;
}

export interface CodeflowStoredReviewFixBlockedItem {
  threadId: string;
  classification: string;
  reason: string;
}

export interface CodeflowStoredReviewFixRun {
  status: CodeflowReviewFixResultStatus;
  prNumber: number | null;
  checkedAt: string;
  repliesPosted: CodeflowStoredReviewFixReply[];
  threadsResolved: CodeflowStoredReviewFixResolution[];
  blocked: CodeflowStoredReviewFixBlockedItem[];
  requiresHumanDecision: string[];
  summary: string;
}

export interface CodeflowReviewFixState {
  lastRun: CodeflowStoredReviewFixRun | null;
}

export interface StoreReviewFixStateInput {
  status: CodeflowReviewFixResultStatus;
  prNumber: number | null;
  replies: CodeflowReviewReplyResult[];
  resolutions: CodeflowReviewResolutionResult[];
  blocked: CodeflowReviewFixBlockedItem[];
  requiresHumanDecision: string[];
  summary: string;
  checkedAt?: string;
}

export function createInitialReviewFixState(): CodeflowReviewFixState {
  return {
    lastRun: null,
  };
}

export function updateReviewFixStateWithResult(
  state: CodeflowReviewFixState,
  input: StoreReviewFixStateInput,
): CodeflowReviewFixState {
  return {
    ...state,
    lastRun: toStoredReviewFixRun(input),
  };
}

export function toStoredReviewFixRun(
  input: StoreReviewFixStateInput,
): CodeflowStoredReviewFixRun {
  return {
    status: input.status,
    prNumber: input.prNumber,
    checkedAt: input.checkedAt ?? nowIso(),
    repliesPosted: input.replies
      .filter((reply) => reply.status === 'posted')
      .slice(0, MAX_STORED_OUTCOMES)
      .map((reply) => ({
        threadId: reply.threadId,
        classification: reply.classification,
        commentId: reply.commentId,
        url: reply.url,
      })),
    threadsResolved: input.resolutions
      .filter((resolution) => resolution.status === 'resolved')
      .slice(0, MAX_STORED_OUTCOMES)
      .map((resolution) => ({
        threadId: resolution.threadId,
        classification: resolution.classification,
      })),
    blocked: input.blocked.slice(0, MAX_STORED_OUTCOMES).map((blocked) => ({
      threadId: blocked.threadId,
      classification: blocked.classification,
      reason: truncateText(blocked.reason, 500),
    })),
    requiresHumanDecision: input.requiresHumanDecision.slice(0, MAX_STORED_OUTCOMES),
    summary: truncateText(input.summary, MAX_STORED_SUMMARY_CHARS),
  };
}
