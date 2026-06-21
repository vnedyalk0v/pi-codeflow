import type { CodeflowCheckRunResult } from '../checks/check-result';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import {
  createInitialLifecycleState,
  type CodeflowLifecycleState,
} from '../lifecycle/lifecycle-state';
import { nowIso } from '../utils/time';
import {
  createInitialCheckState,
  updateCheckStateWithRun,
  type CodeflowCheckState,
} from './check-state';
import {
  createInitialCommitState,
  updateCommitStateWithCommit,
  type CodeflowCommitState,
  type StoreCommitMetadataInput,
} from './commit-state';
import {
  createInitialPrState,
  updatePrStateWithPullRequest,
  type CodeflowPrState,
  type StorePullRequestMetadataInput,
} from './pr-state';
import {
  createInitialGitHubChecksState,
  updateGitHubChecksStateWithResult,
  type CodeflowGitHubChecksState,
} from './github-checks-state';
import {
  createInitialReviewCommentsState,
  updateReviewCommentsStateWithResult,
  type CodeflowReviewCommentsState,
  type StoreReviewCommentsStateInput,
} from './review-comments-state';
import {
  createInitialReviewFixState,
  updateReviewFixStateWithResult,
  type CodeflowReviewFixState,
  type StoreReviewFixStateInput,
} from './review-fix-state';
import type { CodeflowPrChecksResult } from '../github/pr-checks-parser';

export interface CodeflowSessionState {
  lifecycle: CodeflowLifecycleState;
  checks: CodeflowCheckState;
  commits: CodeflowCommitState;
  pullRequests: CodeflowPrState;
  githubChecks?: CodeflowGitHubChecksState;
  reviewComments?: CodeflowReviewCommentsState;
  reviewFix?: CodeflowReviewFixState;
  updatedAt: string;
}

export interface CreateCodeflowSessionStateOptions {
  phase?: CodeflowLifecyclePhase;
  task?: string;
  baseBranch?: string;
  workBranch?: string | null;
}

export function createCodeflowSessionState(
  options: CreateCodeflowSessionStateOptions = {},
): CodeflowSessionState {
  return {
    lifecycle: createInitialLifecycleState(options),
    checks: createInitialCheckState(),
    commits: createInitialCommitState(),
    pullRequests: createInitialPrState(),
    githubChecks: createInitialGitHubChecksState(),
    reviewComments: createInitialReviewCommentsState(),
    reviewFix: createInitialReviewFixState(),
    updatedAt: nowIso(),
  };
}

export function updateSessionStateWithCheckRun(
  state: CodeflowSessionState,
  run: CodeflowCheckRunResult,
  phase: CodeflowLifecyclePhase,
): CodeflowSessionState {
  return {
    ...state,
    lifecycle: {
      ...state.lifecycle,
      phase,
    },
    checks: updateCheckStateWithRun(state.checks, run),
    updatedAt: nowIso(),
  };
}

export function updateSessionStateWithCommit(
  state: CodeflowSessionState,
  input: StoreCommitMetadataInput,
): CodeflowSessionState {
  return {
    ...state,
    lifecycle: {
      ...state.lifecycle,
      phase: 'committed',
    },
    commits: updateCommitStateWithCommit(state.commits, input),
    updatedAt: nowIso(),
  };
}

export function updateSessionStateWithPullRequest(
  state: CodeflowSessionState,
  input: StorePullRequestMetadataInput,
): CodeflowSessionState {
  return {
    ...state,
    lifecycle: {
      ...state.lifecycle,
      phase: 'pr_opened',
    },
    pullRequests: updatePrStateWithPullRequest(state.pullRequests, input),
    githubChecks: state.githubChecks ?? createInitialGitHubChecksState(),
    reviewComments: state.reviewComments ?? createInitialReviewCommentsState(),
    reviewFix: state.reviewFix ?? createInitialReviewFixState(),
    updatedAt: nowIso(),
  };
}

export function updateSessionStateWithGitHubChecks(
  state: CodeflowSessionState,
  result: CodeflowPrChecksResult,
  phase: CodeflowLifecyclePhase,
): CodeflowSessionState {
  return {
    ...state,
    lifecycle: {
      ...state.lifecycle,
      phase,
    },
    githubChecks: updateGitHubChecksStateWithResult(
      state.githubChecks ?? createInitialGitHubChecksState(),
      result,
    ),
    updatedAt: nowIso(),
  };
}

export function updateSessionStateWithReviewComments(
  state: CodeflowSessionState,
  input: StoreReviewCommentsStateInput,
  phase: CodeflowLifecyclePhase,
): CodeflowSessionState {
  return {
    ...state,
    lifecycle: {
      ...state.lifecycle,
      phase,
    },
    reviewComments: updateReviewCommentsStateWithResult(
      state.reviewComments ?? createInitialReviewCommentsState(),
      input,
    ),
    updatedAt: nowIso(),
  };
}

export function updateSessionStateWithReviewFix(
  state: CodeflowSessionState,
  input: StoreReviewFixStateInput,
  phase: CodeflowLifecyclePhase,
): CodeflowSessionState {
  return {
    ...state,
    lifecycle: {
      ...state.lifecycle,
      phase,
    },
    reviewFix: updateReviewFixStateWithResult(
      state.reviewFix ?? createInitialReviewFixState(),
      input,
    ),
    updatedAt: nowIso(),
  };
}
