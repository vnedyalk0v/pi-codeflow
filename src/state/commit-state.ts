import type { CodeflowCommitPayload } from '../commits/commit-payload';
import { nowIso } from '../utils/time';

export interface CodeflowStoredCommit {
  sha: string;
  branch: string | null;
  title: string;
  type: string;
  scope: string | null;
  summary: string;
  refs: string[];
  committedAt: string;
}

export interface CodeflowCommitState {
  lastCommit: CodeflowStoredCommit | null;
}

export interface StoreCommitMetadataInput {
  sha: string;
  branch: string | null;
  title: string;
  payload: CodeflowCommitPayload;
  committedAt?: string;
}

export function createInitialCommitState(): CodeflowCommitState {
  return {
    lastCommit: null,
  };
}

export function updateCommitStateWithCommit(
  state: CodeflowCommitState,
  input: StoreCommitMetadataInput,
): CodeflowCommitState {
  return {
    ...state,
    lastCommit: toStoredCommit(input),
  };
}

export function toStoredCommit(input: StoreCommitMetadataInput): CodeflowStoredCommit {
  return {
    sha: input.sha,
    branch: input.branch,
    title: input.title,
    type: input.payload.type,
    scope: input.payload.scope ?? null,
    summary: input.payload.summary,
    refs: [...(input.payload.refs ?? [])],
    committedAt: input.committedAt ?? nowIso(),
  };
}
