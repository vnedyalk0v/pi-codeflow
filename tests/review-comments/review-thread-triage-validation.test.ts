import { describe, expect, it } from 'vitest';

import { validateReviewCommentTriage, type CodeflowReviewThread } from '../../src/index';

function item(overrides: Record<string, unknown> = {}) {
  return {
    threadId: 'PRRT_thread_1',
    classification: 'valid',
    confidence: 0.9,
    reason: 'The finding matches current code.',
    recommendedAction: 'Fix the issue and add coverage.',
    filesToInspect: ['src/foo.ts'],
    filesToChange: ['src/foo.ts'],
    checksToRun: ['npm test'],
    replyBody: 'Draft after fix and checks.',
    canResolveAfterChecks: true,
    requiresHumanDecision: false,
    ...overrides,
  };
}

function fetchedThread(threadId = 'PRRT_thread_1'): CodeflowReviewThread {
  return {
    threadId,
    prNumber: 123,
    path: 'src/foo.ts',
    line: 1,
    startLine: null,
    isResolved: false,
    isOutdated: false,
    author: 'alice',
    authorAssociation: 'MEMBER',
    firstComment: null,
    comments: [],
    latestComment: null,
    createdAt: null,
    updatedAt: null,
    url: null,
    source: 'github-graphql',
    canResolve: true,
    canReply: true,
  };
}

describe('validateReviewCommentTriage', () => {
  it('accepts valid payloads and counts classifications', () => {
    const result = validateReviewCommentTriage({ threads: [item()] }, { fetchedThreads: [fetchedThread()] });

    expect(result.valid).toBe(true);
    expect(result.classificationCounts.valid).toBe(1);
    expect(result.requiresHumanDecisionCount).toBe(0);
  });

  it('rejects invalid classification and missing required fields', () => {
    expect(validateReviewCommentTriage({ threads: [item({ classification: 'maybe' })] }).valid).toBe(false);
    const missing = validateReviewCommentTriage({ threads: [{ threadId: 'PRRT_thread_1' }] });
    expect(missing.valid).toBe(false);
    expect(missing.errors.map((error) => error.path)).toContain('/threads/0/classification');
  });

  it('enforces needs_human and requiresHumanDecision resolution rules', () => {
    expect(validateReviewCommentTriage({
      threads: [item({
        classification: 'needs_human',
        requiresHumanDecision: false,
        canResolveAfterChecks: false,
      })],
    }).valid).toBe(false);

    expect(validateReviewCommentTriage({
      threads: [item({
        classification: 'needs_human',
        requiresHumanDecision: true,
        canResolveAfterChecks: true,
      })],
    }).valid).toBe(false);

    expect(validateReviewCommentTriage({
      threads: [item({ requiresHumanDecision: true, canResolveAfterChecks: true })],
    }).valid).toBe(false);
  });

  it('rejects unknown fetched thread IDs unless detached validation is allowed', () => {
    const rejected = validateReviewCommentTriage({ threads: [item({ threadId: 'PRRT_unknown' })] }, {
      fetchedThreads: [fetchedThread('PRRT_thread_1')],
    });
    const allowed = validateReviewCommentTriage({ threads: [item({ threadId: 'PRRT_unknown' })] }, {
      fetchedThreads: [fetchedThread('PRRT_thread_1')],
      requireThreadMatch: false,
    });

    expect(rejected.valid).toBe(false);
    expect(rejected.errors[0]?.keyword).toBe('knownThreadId');
    expect(allowed.valid).toBe(true);
  });

  it('rejects missing selected thread IDs when complete triage is required', () => {
    const result = validateReviewCommentTriage({ threads: [item({ threadId: 'PRRT_thread_1' })] }, {
      fetchedThreads: [fetchedThread('PRRT_thread_1'), fetchedThread('PRRT_thread_2')],
      requireAllThreadIds: true,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.keyword)).toContain('allSelectedThreadIds');
  });

  it('validates replyBody as a draft but does not post it', () => {
    const result = validateReviewCommentTriage({ threads: [item({ replyBody: '' })] });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.path)).toContain('/threads/0/replyBody');
  });
});
