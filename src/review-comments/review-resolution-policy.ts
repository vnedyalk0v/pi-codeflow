import type { CodeflowReviewCommentsConfig } from '../config/codeflow-config';
import type { CodeflowStoredCheckRun } from '../state/check-state';
import type { CodeflowStoredCommit } from '../state/commit-state';
import type { CodeflowStoredGitHubChecksRun } from '../state/github-checks-state';
import type { CodeflowStoredReviewCommentThread } from '../state/review-comments-state';
import type { CodeflowReviewFixItem } from './review-fix-payload';

export interface EvaluateReviewResolutionPolicyOptions {
  item: CodeflowReviewFixItem;
  config: CodeflowReviewCommentsConfig;
  knownThread?: CodeflowStoredReviewCommentThread | null;
  latestCheckRun?: CodeflowStoredCheckRun | null;
  latestCommit?: CodeflowStoredCommit | null;
  latestGitHubChecksRun?: CodeflowStoredGitHubChecksRun | null;
  allowInvalidResolution?: boolean;
  prNumber?: number | null;
}

export interface CodeflowReviewResolutionPolicyDecision {
  allowed: boolean;
  blockedReasons: string[];
  warnings: string[];
}

export function evaluateReviewResolutionPolicy(
  options: EvaluateReviewResolutionPolicyOptions,
): CodeflowReviewResolutionPolicyDecision {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];
  const { item, config, knownThread } = options;

  if (!item.resolveRequested) {
    blockedReasons.push('resolution was not requested for this thread');
    return { allowed: false, blockedReasons, warnings };
  }

  if (knownThread?.isResolved === true) {
    warnings.push('thread is already resolved; resolution will be skipped');
    return { allowed: false, blockedReasons, warnings };
  }

  if (knownThread?.requiresHumanDecision === true) {
    blockedReasons.push('latest triage state requires a human decision');
  }

  if (item.classification === 'needs_human') {
    blockedReasons.push('needs_human threads must never be resolved');
  }

  if (item.classification === 'invalid') {
    const invalidAllowed = options.allowInvalidResolution === true || (
      !config.requireHumanForInvalid &&
      config.autoResolveClassifications.includes('invalid')
    );

    if (!invalidAllowed) {
      blockedReasons.push('invalid threads cannot be resolved by default');
    }
  }

  if (
    (item.classification === 'already_fixed' || item.classification === 'stale') &&
    !config.autoResolveClassifications.includes(item.classification)
  ) {
    blockedReasons.push(`${item.classification} is not allowed by reviewComments.autoResolveClassifications`);
  }

  if (item.classification === 'valid' && !item.commitSha) {
    blockedReasons.push('valid findings require commitSha before resolution');
  }

  if (
    ['valid', 'already_fixed', 'stale'].includes(item.classification) &&
    !hasText(item.fixSummary)
  ) {
    blockedReasons.push(`${item.classification} threads require fixSummary evidence before resolution`);
  }

  if (item.verification.length === 0) {
    blockedReasons.push('verification evidence is required before resolution');
  }

  if (config.requireChecksBeforeResolve) {
    const checkDecision = evaluateChecksBeforeResolve({
      item,
      latestCheckRun: options.latestCheckRun,
      latestCommit: options.latestCommit,
    });
    blockedReasons.push(...checkDecision.blockedReasons);
    warnings.push(...checkDecision.warnings);
  }

  const githubDecision = evaluateGitHubChecksForResolution({
    item,
    latestCommit: options.latestCommit ?? null,
    latestGitHubChecksRun: options.latestGitHubChecksRun,
    prNumber: options.prNumber ?? null,
  });
  blockedReasons.push(...githubDecision.blockedReasons);
  warnings.push(...githubDecision.warnings);

  if (item.classification === 'stale' && knownThread?.isOutdated !== true && !hasText(item.fixSummary)) {
    blockedReasons.push('stale threads must be marked outdated by GitHub or include evidence explaining why they are stale');
  }

  return {
    allowed: blockedReasons.length === 0,
    blockedReasons,
    warnings,
  };
}

function evaluateChecksBeforeResolve(options: {
  item: CodeflowReviewFixItem;
  latestCheckRun?: CodeflowStoredCheckRun | null;
  latestCommit?: CodeflowStoredCommit | null;
}): CodeflowReviewResolutionPolicyDecision {
  const warnings: string[] = [];
  const blockedReasons: string[] = [];
  const latestCheckRun = options.latestCheckRun ?? null;

  if (latestCheckRun?.status === 'passed') {
    const commitBlocker = validateCheckRunAfterCommit(options.item, latestCheckRun, options.latestCommit ?? null);
    if (commitBlocker) {
      blockedReasons.push(commitBlocker);
    }
    return { allowed: blockedReasons.length === 0, blockedReasons, warnings };
  }

  if (!latestCheckRun && options.item.checksRun.length > 0 && options.item.verification.length > 0) {
    warnings.push('No latest /flow-check state was available; using payload checksRun and verification as explicit evidence.');
    return { allowed: true, blockedReasons, warnings };
  }

  if (!latestCheckRun) {
    blockedReasons.push('latest /flow-check state is missing and checks are required before resolution');
  } else {
    blockedReasons.push(`latest /flow-check state is ${latestCheckRun.status}, not passed`);
  }

  return { allowed: false, blockedReasons, warnings };
}

function validateCheckRunAfterCommit(
  item: CodeflowReviewFixItem,
  latestCheckRun: CodeflowStoredCheckRun,
  latestCommit: CodeflowStoredCommit | null,
): string | null {
  if (item.classification !== 'valid' || !item.commitSha) {
    return null;
  }

  if (!latestCommit) {
    return 'Latest /flow-commit state is missing; cannot prove /flow-check verified the fix commit.';
  }

  if (!shasMatch(latestCommit.sha, item.commitSha)) {
    return `Latest /flow-commit state ${latestCommit.sha} does not match requested fix commit ${item.commitSha}.`;
  }

  const checkFinishedAt = Date.parse(latestCheckRun.finishedAt);
  const committedAt = Date.parse(latestCommit.committedAt);

  if (!Number.isFinite(checkFinishedAt) || !Number.isFinite(committedAt)) {
    return 'Could not compare latest /flow-check time with the fix commit time.';
  }

  if (checkFinishedAt < committedAt) {
    return 'Latest /flow-check finished before the fix commit; rerun /flow-check before resolving.';
  }

  return null;
}

function evaluateGitHubChecksForResolution(options: {
  item: CodeflowReviewFixItem;
  latestCommit: CodeflowStoredCommit | null;
  latestGitHubChecksRun?: CodeflowStoredGitHubChecksRun | null;
  prNumber: number | null;
}): CodeflowReviewResolutionPolicyDecision {
  const { item, latestCommit, latestGitHubChecksRun, prNumber } = options;

  if (!latestGitHubChecksRun) {
    return { allowed: true, blockedReasons: [], warnings: [] };
  }

  if (prNumber !== null && latestGitHubChecksRun.prNumber !== prNumber) {
    return {
      allowed: false,
      blockedReasons: [
        `latest GitHub checks state belongs to PR ${formatNullablePr(latestGitHubChecksRun.prNumber)}, not PR #${prNumber}`,
      ],
      warnings: [],
    };
  }

  if (latestGitHubChecksRun.status !== 'passed') {
    return {
      allowed: false,
      blockedReasons: [`latest GitHub checks state is ${latestGitHubChecksRun.status}, not passed`],
      warnings: [],
    };
  }

  const staleDecision = evaluateGitHubChecksFreshness({
    item,
    latestCommit,
    latestGitHubChecksRun,
  });

  if (!staleDecision.allowed) {
    return staleDecision;
  }

  return { allowed: true, blockedReasons: [], warnings: [] };
}

function evaluateGitHubChecksFreshness(options: {
  item: CodeflowReviewFixItem;
  latestCommit: CodeflowStoredCommit | null;
  latestGitHubChecksRun: CodeflowStoredGitHubChecksRun;
}): CodeflowReviewResolutionPolicyDecision {
  const { item, latestCommit, latestGitHubChecksRun } = options;

  if (item.classification !== 'valid' || !item.commitSha) {
    return { allowed: true, blockedReasons: [], warnings: [] };
  }

  if (latestGitHubChecksRun.headSha) {
    if (shasMatch(latestGitHubChecksRun.headSha, item.commitSha)) {
      return { allowed: true, blockedReasons: [], warnings: [] };
    }

    return {
      allowed: false,
      blockedReasons: [
        `latest GitHub checks head ${latestGitHubChecksRun.headSha} does not match requested fix commit ${item.commitSha}`,
      ],
      warnings: [],
    };
  }

  if (!latestCommit || !shasMatch(latestCommit.sha, item.commitSha)) {
    return { allowed: true, blockedReasons: [], warnings: [] };
  }

  const checksFinishedAt = Date.parse(latestGitHubChecksRun.finishedAt);
  const committedAt = Date.parse(latestCommit.committedAt);

  if (!Number.isFinite(checksFinishedAt) || !Number.isFinite(committedAt)) {
    return {
      allowed: false,
      blockedReasons: ['Could not compare latest GitHub checks time with the fix commit time.'],
      warnings: [],
    };
  }

  if (checksFinishedAt < committedAt) {
    return {
      allowed: false,
      blockedReasons: ['Latest GitHub checks finished before the fix commit; rerun /flow-watch after CI completes before resolving.'],
      warnings: [],
    };
  }

  return { allowed: true, blockedReasons: [], warnings: [] };
}

function shasMatch(left: string, right: string): boolean {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();

  return normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(normalizedRight) ||
    normalizedRight.startsWith(normalizedLeft);
}

function formatNullablePr(prNumber: number | null): string {
  return prNumber === null ? 'unknown' : `#${prNumber}`;
}

function hasText(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}
