import { describe, expect, it } from 'vitest';

import {
  buildCommitTitle,
  summarizeCommitBody,
  type CodeflowCommitPayload,
} from '../../src/index';

function payload(overrides: Partial<CodeflowCommitPayload> = {}): CodeflowCommitPayload {
  return {
    type: 'feat',
    summary: 'add commit summaries',
    context: 'Needed for final reports.',
    changes: ['Added bounded metadata.'],
    verification: ['npm test'],
    risk: 'Low.',
    refs: ['#11'],
    ...overrides,
  };
}

describe('commit summary helpers', () => {
  it('builds Conventional Commit titles with and without scope', () => {
    expect(buildCommitTitle(payload({ scope: 'commits' }))).toBe(
      'feat(commits): add commit summaries',
    );
    expect(buildCommitTitle(payload({ type: 'docs' }))).toBe('docs: add commit summaries');
  });

  it('builds breaking-change titles with a bang marker', () => {
    expect(buildCommitTitle(payload({ breakingChange: 'Commit payloads changed.' }))).toBe(
      'feat!: add commit summaries',
    );
  });

  it('summarizes commit body sections without storing large bodies', () => {
    const summary = summarizeCommitBody(
      'feat: add commit summaries\n\nContext:\nA\n\nChanges:\n- B\n\nVerification:\n- C\n\nRisk:\nLow.',
    );

    expect(summary).toBe('Context, Changes, Verification, Risk');
  });
});
