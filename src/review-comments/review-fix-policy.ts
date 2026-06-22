import type { CodeflowReviewCommentsConfig } from '../config/codeflow-config';
import type { CodeflowStoredCheckRun } from '../state/check-state';
import type { CodeflowStoredCommit } from '../state/commit-state';
import type { CodeflowStoredGitHubChecksRun } from '../state/github-checks-state';
import type { CodeflowStoredReviewCommentThread } from '../state/review-comments-state';
import type { CodeflowReviewFixItem, CodeflowReviewFixPolicyResult } from './review-fix-payload';
import { evaluateReviewResolutionPolicy } from './review-resolution-policy';

export interface EvaluateReviewFixPolicyOptions {
  item: CodeflowReviewFixItem;
  config: CodeflowReviewCommentsConfig;
  knownThread?: CodeflowStoredReviewCommentThread | null;
  latestCheckRun?: CodeflowStoredCheckRun | null;
  latestCommit?: CodeflowStoredCommit | null;
  latestGitHubChecksRun?: CodeflowStoredGitHubChecksRun | null;
  allowInvalidResolution?: boolean;
  prNumber?: number | null;
  includeResolutionPolicy?: boolean;
  includeReplyPolicy?: boolean;
}

export function evaluateReviewFixPolicy(
  options: EvaluateReviewFixPolicyOptions,
): CodeflowReviewFixPolicyResult {
  const { item, config, knownThread } = options;
  const blockedReasons: string[] = [];
  const warnings: string[] = [];
  const includeReplyPolicy = options.includeReplyPolicy !== false;
  let canReply = includeReplyPolicy ? evaluateReplyAllowed(item, knownThread, blockedReasons) : false;
  let requiresHumanDecision = false;
  let shouldSkip = false;

  if (knownThread?.isResolved === true) {
    warnings.push('thread is already resolved; reply and resolution will be skipped');
    canReply = false;
    shouldSkip = true;
  }

  if (knownThread?.requiresHumanDecision === true) {
    blockedReasons.push('latest triage state requires a human decision');
    requiresHumanDecision = true;
    canReply = false;
  }

  if (item.classification === 'needs_human') {
    blockedReasons.push('needs_human threads require a human decision and cannot be automatically replied to or resolved');
    requiresHumanDecision = true;
    canReply = false;
  }

  if (!config.enabled) {
    blockedReasons.push('reviewComments.enabled is false');
    canReply = false;
  }

  const includeResolutionPolicy = options.includeResolutionPolicy !== false;
  const resolution = includeResolutionPolicy
    ? evaluateReviewResolutionPolicy(options)
    : { allowed: false, blockedReasons: [], warnings: [] };
  warnings.push(...resolution.warnings);

  if (includeResolutionPolicy && item.resolveRequested && !resolution.allowed) {
    blockedReasons.push(...resolution.blockedReasons);
  }

  return {
    threadId: item.threadId,
    classification: item.classification,
    canReply: includeReplyPolicy && canReply && blockedReasons.length === 0,
    canResolve: includeResolutionPolicy && item.resolveRequested && resolution.allowed && blockedReasons.length === 0,
    requiresHumanDecision,
    shouldSkip,
    blockedReasons: uniqueStrings(blockedReasons),
    warnings: uniqueStrings(warnings),
  };
}

function evaluateReplyAllowed(
  item: CodeflowReviewFixItem,
  knownThread: CodeflowStoredReviewCommentThread | null | undefined,
  blockedReasons: string[],
): boolean {
  if (knownThread?.isResolved === true) {
    return false;
  }

  if (knownThread?.requiresHumanDecision === true || item.classification === 'needs_human') {
    return false;
  }

  if (item.classification === 'valid') {
    if (!hasText(item.fixSummary)) {
      blockedReasons.push('valid findings require fixSummary evidence before replying');
    }

    if (item.verification.length === 0) {
      blockedReasons.push('valid findings require verification evidence before replying');
    }

    return true;
  }

  if (item.classification === 'already_fixed' || item.classification === 'stale') {
    if (!hasText(item.fixSummary)) {
      blockedReasons.push(`${item.classification} threads require evidence before replying`);
    }

    if (item.verification.length === 0) {
      blockedReasons.push(`${item.classification} threads require verification evidence before replying`);
    }

    return true;
  }

  if (item.classification === 'invalid') {
    if (!hasText(item.fixSummary) && !hasText(item.humanDecision) && !hasText(item.replyBody)) {
      blockedReasons.push('invalid threads require an explanation before replying');
    }

    return true;
  }

  return false;
}

function hasText(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
