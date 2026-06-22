import { describe, expect, it } from 'vitest';

import {
  getDefaultCodeflowConfig,
  validateReviewFixPayload,
  type CodeflowReviewFixPayload,
} from '../../src/index';
import type { CodeflowStoredReviewCommentThread } from '../../src/state/review-comments-state';

const config = getDefaultCodeflowConfig();

function validPayload(overrides: Partial<CodeflowReviewFixPayload['items'][number]> = {}): CodeflowReviewFixPayload {
  return {
    prNumber: 123,
    items: [
      {
        threadId: 'PRRT_thread_1',
        classification: 'valid',
        fixSummary: 'Updated the code and added coverage.',
        verification: ['npm test passed'],
        checksRun: ['npm test'],
        commitSha: 'abc1234',
        resolveRequested: true,
        ...overrides,
      },
    ],
  };
}

function knownThread(overrides: Partial<CodeflowStoredReviewCommentThread> = {}): CodeflowStoredReviewCommentThread {
  return {
    threadId: 'PRRT_thread_1',
    path: 'src/example.ts',
    line: 10,
    isResolved: false,
    isOutdated: false,
    author: 'alice',
    latestCommentSummary: 'Please fix this.',
    classification: 'valid',
    requiresHumanDecision: false,
    canResolveAfterChecks: true,
    ...overrides,
  };
}

describe('validateReviewFixPayload', () => {
  it('accepts a valid fix payload', () => {
    const result = validateReviewFixPayload(validPayload(), {
      knownThreads: [knownThread()],
      config: config.reviewComments,
    });

    expect(result.valid).toBe(true);
    expect(result.payload?.items[0]?.threadId).toBe('PRRT_thread_1');
  });

  it('rejects missing threadId and invalid classifications', () => {
    expect(validateReviewFixPayload({ items: [{ classification: 'valid', verification: [], checksRun: [], resolveRequested: false }] }, { detached: true }).valid).toBe(false);
    expect(validateReviewFixPayload(validPayload({ classification: 'unknown' as never }), { detached: true }).valid).toBe(false);
  });

  it('requires verification, checks, and commit SHA when resolving valid findings', () => {
    const result = validateReviewFixPayload(validPayload({ verification: [], checksRun: [], commitSha: undefined }), {
      knownThreads: [knownThread()],
      config: config.reviewComments,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.keyword)).toEqual(expect.arrayContaining([
      'verificationRequiredForResolve',
      'checksRequiredForResolve',
      'commitShaRequiredForValidResolve',
    ]));
  });

  it('rejects needs_human and invalid resolution by default', () => {
    const needsHuman = validateReviewFixPayload(validPayload({
      classification: 'needs_human',
      commitSha: undefined,
      fixSummary: undefined,
      humanDecision: 'Maintainer decision required.',
    }), { detached: true, config: config.reviewComments });
    const invalid = validateReviewFixPayload(validPayload({
      classification: 'invalid',
      commitSha: undefined,
      fixSummary: 'The review assumption is incorrect.',
    }), { detached: true, config: config.reviewComments });

    expect(needsHuman.valid).toBe(false);
    expect(needsHuman.errors.map((error) => error.keyword)).toContain('needsHumanCannotResolve');
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.map((error) => error.keyword)).toContain('invalidResolutionRequiresPolicy');
  });

  it('honors latest triage state thread IDs, classifications, and human-decision blockers', () => {
    const unknown = validateReviewFixPayload(validPayload({ threadId: 'PRRT_unknown' }), {
      knownThreads: [knownThread()],
      config: config.reviewComments,
    });
    const mismatch = validateReviewFixPayload(validPayload({ classification: 'already_fixed', commitSha: undefined }), {
      knownThreads: [knownThread()],
      config: config.reviewComments,
    });
    const human = validateReviewFixPayload(validPayload(), {
      knownThreads: [knownThread({ requiresHumanDecision: true })],
      config: config.reviewComments,
    });

    expect(unknown.valid).toBe(false);
    expect(unknown.errors.map((error) => error.keyword)).toContain('knownThreadId');
    expect(mismatch.valid).toBe(false);
    expect(mismatch.errors.map((error) => error.keyword)).toContain('triageClassificationMatch');
    expect(human.valid).toBe(false);
    expect(human.errors.map((error) => error.keyword)).toContain('triageRequiresHumanDecision');
  });

  it('requires stored triage metadata for non-detached review state', () => {
    const missingTriage = validateReviewFixPayload(validPayload(), {
      knownThreads: [knownThread({ classification: undefined, requiresHumanDecision: undefined })],
      config: config.reviewComments,
    });
    const detached = validateReviewFixPayload(validPayload(), {
      knownThreads: [knownThread({ classification: undefined, requiresHumanDecision: undefined })],
      detached: true,
      config: config.reviewComments,
    });

    expect(missingTriage.valid).toBe(false);
    expect(missingTriage.errors.map((error) => error.keyword)).toContain('triageMetadataRequired');
    expect(detached.valid).toBe(true);
  });

  it('allows outdated stale resolution without redundant text evidence', () => {
    const result = validateReviewFixPayload(validPayload({
      classification: 'stale',
      commitSha: undefined,
      fixSummary: undefined,
    }), {
      knownThreads: [knownThread({ classification: 'stale', isOutdated: true })],
      config: config.reviewComments,
    });

    expect(result.valid).toBe(true);
  });

  it('allows detached validation without matching latest state', () => {
    const result = validateReviewFixPayload(validPayload({ threadId: 'PRRT_detached' }), {
      detached: true,
      config: config.reviewComments,
    });
    const staleState = validateReviewFixPayload(validPayload(), {
      knownThreads: [knownThread({ classification: 'needs_human', requiresHumanDecision: true })],
      detached: true,
      config: config.reviewComments,
    });

    expect(result.valid).toBe(true);
    expect(staleState.valid).toBe(true);
  });

  it('rejects huge reply bodies', () => {
    const result = validateReviewFixPayload(validPayload({
      resolveRequested: false,
      replyBody: 'x'.repeat(5000),
    }), { detached: true, config: config.reviewComments });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.path)).toContain('/items/0/replyBody');
  });
});
