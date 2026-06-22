import { describe, expect, it } from 'vitest';

import {
  createInitialReviewFixState,
  updateReviewFixStateWithResult,
} from '../../src/state/review-fix-state';
import {
  createCodeflowSessionState,
  updateSessionStateWithReviewFix,
} from '../../src/state/session-state';

describe('Codeflow review-fix state', () => {
  it('stores dry-run previews without marking applied', () => {
    const state = updateReviewFixStateWithResult(createInitialReviewFixState(), {
      status: 'dry_run',
      prNumber: 123,
      replies: [{ threadId: 'PRRT_1', classification: 'valid', status: 'planned', commentId: null, url: null, body: 'reply body' }],
      resolutions: [{ threadId: 'PRRT_1', classification: 'valid', status: 'planned', resolved: false }],
      blocked: [],
      requiresHumanDecision: [],
      summary: 'summary',
      checkedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(state.lastRun?.status).toBe('dry_run');
    expect(state.lastRun?.repliesPosted).toEqual([]);
    expect(state.lastRun?.threadsResolved).toEqual([]);
  });

  it('stores posted replies, resolutions, and blocked items without reply bodies', () => {
    const hugeBody = 'reply body '.repeat(1000);
    const state = updateReviewFixStateWithResult(createInitialReviewFixState(), {
      status: 'applied',
      prNumber: 123,
      replies: [{ threadId: 'PRRT_1', classification: 'valid', status: 'posted', commentId: 'PRRC_1', url: 'https://example.test', body: hugeBody }],
      resolutions: [{ threadId: 'PRRT_1', classification: 'valid', status: 'resolved', resolved: true }],
      blocked: [{ threadId: 'PRRT_2', classification: 'needs_human', reason: 'human decision required' }],
      requiresHumanDecision: ['PRRT_2'],
      summary: 'summary '.repeat(1000),
    });

    expect(state.lastRun?.repliesPosted).toEqual([{ threadId: 'PRRT_1', classification: 'valid', commentId: 'PRRC_1', url: 'https://example.test' }]);
    expect(state.lastRun?.threadsResolved).toEqual([{ threadId: 'PRRT_1', classification: 'valid' }]);
    expect(state.lastRun?.blocked[0]?.threadId).toBe('PRRT_2');
    expect(JSON.stringify(state)).not.toContain(hugeBody);
    expect(state.lastRun?.summary.length ?? 0).toBeLessThanOrEqual(2000);
  });

  it('stores replied-to comment metadata when available', () => {
    const state = updateReviewFixStateWithResult(createInitialReviewFixState(), {
      status: 'applied',
      prNumber: 123,
      replies: [{
        threadId: 'PRRT_1',
        classification: 'valid',
        status: 'posted',
        commentId: 'PRRC_reply_1',
        url: null,
        body: null,
        repliedToCommentId: 'PRRC_review_1',
      }],
      resolutions: [],
      blocked: [],
      requiresHumanDecision: [],
      summary: 'summary',
    });

    expect(state.lastRun?.repliesPosted[0]?.repliedToCommentId).toBe('PRRC_review_1');
  });

  it('preserves posted reply metadata when a later dry-run preview is stored', () => {
    const applied = updateReviewFixStateWithResult(createInitialReviewFixState(), {
      status: 'applied',
      prNumber: 123,
      replies: [{ threadId: 'PRRT_1', classification: 'valid', status: 'posted', commentId: 'PRRC_1', url: null, body: null }],
      resolutions: [],
      blocked: [],
      requiresHumanDecision: [],
      summary: 'applied',
    });
    const preview = updateReviewFixStateWithResult(applied, {
      status: 'dry_run',
      prNumber: 123,
      replies: [{ threadId: 'PRRT_1', classification: 'valid', status: 'planned', commentId: null, url: null, body: 'planned' }],
      resolutions: [],
      blocked: [],
      requiresHumanDecision: [],
      summary: 'preview',
    });

    expect(preview.lastRun?.status).toBe('dry_run');
    expect(preview.lastRun?.repliesPosted).toEqual([
      { threadId: 'PRRT_1', classification: 'valid', commentId: 'PRRC_1', url: null },
    ]);
  });

  it('bounds stored outcomes and keeps newest merged entries', () => {
    const replies = Array.from({ length: 60 }, (_, index) => ({
      threadId: `PRRT_${index}`,
      classification: 'valid' as const,
      status: 'posted' as const,
      commentId: `PRRC_${index}`,
      url: null,
      body: null,
    }));
    const state = updateReviewFixStateWithResult(createInitialReviewFixState(), {
      status: 'applied',
      prNumber: 123,
      replies,
      resolutions: [],
      blocked: [],
      requiresHumanDecision: [],
      summary: 'summary',
    });
    const merged = updateReviewFixStateWithResult(state, {
      status: 'applied',
      prNumber: 123,
      replies: [{ threadId: 'PRRT_new', classification: 'valid', status: 'posted', commentId: 'PRRC_new', url: null, body: null }],
      resolutions: [{ threadId: 'PRRT_resolved', classification: 'valid', status: 'resolved', resolved: true }],
      blocked: [],
      requiresHumanDecision: [],
      summary: 'summary',
    });

    expect(state.lastRun?.repliesPosted).toHaveLength(50);
    expect(merged.lastRun?.repliesPosted).toHaveLength(50);
    expect(merged.lastRun?.repliesPosted[0]?.threadId).toBe('PRRT_new');
    expect(merged.lastRun?.threadsResolved[0]?.threadId).toBe('PRRT_resolved');
  });

  it('updates session lifecycle with latest review-fix result', () => {
    const session = createCodeflowSessionState({ phase: 'review_triage' });
    const updated = updateSessionStateWithReviewFix(session, {
      status: 'applied',
      prNumber: 123,
      replies: [],
      resolutions: [],
      blocked: [],
      requiresHumanDecision: [],
      summary: 'summary',
    }, 'verified');

    expect(updated.lifecycle.phase).toBe('verified');
    expect(updated.reviewFix?.lastRun?.status).toBe('applied');
  });
});
