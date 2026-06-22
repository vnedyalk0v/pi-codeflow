import { describe, expect, it } from 'vitest';

import { validateReviewCommentTriage, type CodeflowReviewThread } from '../../src/index';
import {
  createInitialReviewCommentsState,
  updateReviewCommentsStateWithResult,
} from '../../src/state/review-comments-state';
import {
  createCodeflowSessionState,
  updateSessionStateWithReviewComments,
} from '../../src/state/session-state';

function thread(index: number, body = 'Review finding body'): CodeflowReviewThread {
  return {
    threadId: `PRRT_thread_${index}`,
    prNumber: 123,
    path: `src/file-${index}.ts`,
    line: index,
    startLine: null,
    isResolved: false,
    isOutdated: false,
    author: 'alice',
    authorAssociation: 'MEMBER',
    firstComment: null,
    comments: [],
    latestComment: {
      id: `PRRC_comment_${index}`,
      databaseId: null,
      author: 'alice',
      authorAssociation: 'MEMBER',
      body,
      path: `src/file-${index}.ts`,
      line: index,
      createdAt: null,
      updatedAt: null,
      url: null,
      isMinimized: false,
      viewerCanUpdate: false,
      viewerCanDelete: false,
    },
    createdAt: null,
    updatedAt: null,
    url: null,
    source: 'github-graphql',
    canResolve: true,
    canReply: true,
  };
}

describe('Codeflow review comments state', () => {
  it('stores found and none latest review comment states', () => {
    const found = updateReviewCommentsStateWithResult(createInitialReviewCommentsState(), {
      status: 'found',
      prNumber: 123,
      prUrl: 'https://github.com/org/repo/pull/123',
      unresolvedOnly: true,
      includeOutdated: false,
      fetchedThreadCount: 1,
      filteredThreadCount: 1,
      threads: [thread(1)],
      summary: 'summary',
      checkedAt: '2026-01-01T00:00:00.000Z',
    });
    const none = updateReviewCommentsStateWithResult(createInitialReviewCommentsState(), {
      status: 'none',
      prNumber: 123,
      prUrl: 'https://github.com/org/repo/pull/123',
      unresolvedOnly: true,
      includeOutdated: false,
      fetchedThreadCount: 0,
      filteredThreadCount: 0,
      threads: [],
      summary: 'none',
      checkedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(found.lastRun?.status).toBe('found');
    expect(found.lastRun?.threads[0]?.latestCommentSummary).toBe('Review finding body');
    expect(found.lastRun?.threads[0]?.latestCommentId).toBe('PRRC_comment_1');
    expect(none.lastRun?.status).toBe('none');
  });

  it('stores triage classification counts and human-decision flags', () => {
    const triage = validateReviewCommentTriage({
      threads: [
        {
          threadId: 'PRRT_thread_1',
          classification: 'needs_human',
          confidence: 0.8,
          reason: 'Decision required.',
          recommendedAction: 'Ask maintainer.',
          filesToInspect: ['src/file-1.ts'],
          filesToChange: [],
          checksToRun: [],
          replyBody: 'Maintainer decision needed.',
          canResolveAfterChecks: false,
          requiresHumanDecision: true,
        },
      ],
    });
    const state = updateReviewCommentsStateWithResult(createInitialReviewCommentsState(), {
      status: 'found',
      prNumber: 123,
      prUrl: null,
      unresolvedOnly: true,
      includeOutdated: false,
      fetchedThreadCount: 1,
      filteredThreadCount: 1,
      threads: [thread(1)],
      triage,
      summary: 'summary',
    });

    expect(state.lastRun?.classificationCounts.needs_human).toBe(1);
    expect(state.lastRun?.requiresHumanDecisionCount).toBe(1);
    expect(state.lastRun?.threads[0]?.classification).toBe('needs_human');
  });

  it('stores full thread metadata with bounded summaries and omits full huge bodies', () => {
    const hugeBody = 'large body '.repeat(1000);
    const state = updateReviewCommentsStateWithResult(createInitialReviewCommentsState(), {
      status: 'found',
      prNumber: 123,
      prUrl: null,
      unresolvedOnly: true,
      includeOutdated: false,
      fetchedThreadCount: 60,
      filteredThreadCount: 60,
      threads: Array.from({ length: 60 }, (_, index) => thread(index + 1, hugeBody)),
      summary: 'summary '.repeat(1000),
    });

    expect(state.lastRun?.threads).toHaveLength(60);
    expect(state.lastRun?.threadIds).toHaveLength(60);
    expect(state.lastRun?.threadIds?.at(-1)).toBe('PRRT_thread_60');
    expect(state.lastRun?.summary.length ?? 0).toBeLessThanOrEqual(2000);
    expect(JSON.stringify(state)).not.toContain(hugeBody);
  });

  it('updates session lifecycle when not dry-run', () => {
    const session = createCodeflowSessionState({ phase: 'pr_opened' });
    const updated = updateSessionStateWithReviewComments(session, {
      status: 'found',
      prNumber: 123,
      prUrl: null,
      unresolvedOnly: true,
      includeOutdated: false,
      fetchedThreadCount: 1,
      filteredThreadCount: 1,
      threads: [thread(1)],
      summary: 'summary',
    }, 'review_triage');

    expect(updated.lifecycle.phase).toBe('review_triage');
    expect(updated.reviewComments?.lastRun?.status).toBe('found');
  });
});
