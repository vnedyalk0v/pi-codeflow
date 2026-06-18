import { nowIso } from '../utils/time';

export interface CodeflowStoredPullRequest {
  number: number;
  url: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  draft: boolean;
  createdAt: string;
}

export interface CodeflowPrState {
  lastPullRequest: CodeflowStoredPullRequest | null;
}

export interface StorePullRequestMetadataInput {
  number: number;
  url: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  draft: boolean;
  createdAt?: string;
}

export function createInitialPrState(): CodeflowPrState {
  return {
    lastPullRequest: null,
  };
}

export function updatePrStateWithPullRequest(
  state: CodeflowPrState,
  input: StorePullRequestMetadataInput,
): CodeflowPrState {
  return {
    ...state,
    lastPullRequest: toStoredPullRequest(input),
  };
}

export function toStoredPullRequest(
  input: StorePullRequestMetadataInput,
): CodeflowStoredPullRequest {
  return {
    number: input.number,
    url: input.url,
    baseBranch: input.baseBranch,
    headBranch: input.headBranch,
    title: input.title,
    draft: input.draft,
    createdAt: input.createdAt ?? nowIso(),
  };
}
