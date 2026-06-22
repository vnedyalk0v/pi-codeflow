import { describe, expect, it } from 'vitest';

import {
  getDefaultCodeflowConfig,
  runFlowFixComments,
  type CodeflowReviewFixPayload,
} from '../../src/index';
import { createCodeflowSessionState } from '../../src/state/session-state';

function payload(overrides: Partial<CodeflowReviewFixPayload['items'][number]> = {}): CodeflowReviewFixPayload {
  return {
    prNumber: 123,
    items: [
      {
        threadId: 'PRRT_thread_1',
        classification: 'valid',
        fixSummary: 'Updated validation and added coverage.',
        verification: ['npm test passed'],
        checksRun: ['npm test'],
        commitSha: 'abc1234',
        resolveRequested: true,
        ...overrides,
      },
    ],
  };
}

function session(classification = 'valid') {
  const state = createCodeflowSessionState({ phase: 'review_triage' });
  state.reviewComments = {
    lastRun: {
      status: 'found',
      prNumber: 123,
      prUrl: null,
      unresolvedOnly: true,
      includeOutdated: false,
      fetchedThreadCount: 1,
      filteredThreadCount: 1,
      classificationCounts: { [classification]: 1 },
      requiresHumanDecisionCount: classification === 'needs_human' ? 1 : 0,
      threads: [
        {
          threadId: 'PRRT_thread_1',
          path: 'src/example.ts',
          line: 1,
          isResolved: false,
          isOutdated: false,
          author: 'alice',
          latestCommentSummary: 'Please fix this.',
          classification,
          requiresHumanDecision: classification === 'needs_human',
          canResolveAfterChecks: classification !== 'needs_human',
        },
      ],
      summary: 'summary',
      checkedAt: '2026-01-01T00:00:00.000Z',
    },
  };
  state.checks.lastRun = {
    status: 'passed',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:00.000Z',
    durationMs: 60_000,
    results: [],
  };
  state.commits.lastCommit = {
    sha: 'abc1234',
    branch: 'feat/comments',
    title: 'fix: comments',
    type: 'fix',
    scope: null,
    summary: 'Fix comments.',
    refs: ['#14'],
    committedAt: '2026-01-01T00:00:30.000Z',
  };
  return state;
}

describe('/flow-fix-comments lifecycle behavior', () => {
  it('keeps dry-runs in the current safe phase and does not claim verified from preview', async () => {
    const result = await runFlowFixComments({
      payload: payload(),
      dryRun: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session(),
    });
    const verifiedSession = session();
    verifiedSession.lifecycle.phase = 'verified';
    const verifiedPreview = await runFlowFixComments({
      payload: payload(),
      dryRun: true,
      config: getDefaultCodeflowConfig(),
      sessionState: verifiedSession,
    });

    expect(result.lifecyclePhase).toBe('review_triage');
    expect(result.status).toBe('dry_run');
    expect(verifiedPreview.lifecyclePhase).toBe('verified');
    expect(verifiedPreview.sessionState.lifecycle.phase).toBe('verified');
  });

  it('moves successful allowed resolutions toward verified only after all known threads are resolved', async () => {
    const result = await runFlowFixComments({
      payload: payload(),
      applyResolutions: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session(),
      resolveThread: async (options) => ({
        threadId: options.threadId,
        classification: 'valid',
        status: 'resolved',
        resolved: true,
      }),
    });
    const partialSession = session();
    partialSession.reviewComments!.lastRun!.threads.push({
      threadId: 'PRRT_thread_2',
      path: 'src/other.ts',
      line: 2,
      isResolved: false,
      isOutdated: false,
      author: 'alice',
      latestCommentSummary: 'Please fix this too.',
      classification: 'valid',
      requiresHumanDecision: false,
      canResolveAfterChecks: true,
    });
    const partial = await runFlowFixComments({
      payload: payload(),
      applyResolutions: true,
      config: getDefaultCodeflowConfig(),
      sessionState: partialSession,
      resolveThread: async (options) => ({
        threadId: options.threadId,
        classification: 'valid',
        status: 'resolved',
        resolved: true,
      }),
    });
    const humanSession = session();
    humanSession.reviewComments!.lastRun!.threads.push({
      threadId: 'PRRT_thread_2',
      path: 'src/other.ts',
      line: 2,
      isResolved: false,
      isOutdated: false,
      author: 'alice',
      latestCommentSummary: 'Needs maintainer decision.',
      classification: 'needs_human',
      requiresHumanDecision: true,
      canResolveAfterChecks: false,
    });
    const withHumanDecision = await runFlowFixComments({
      payload: payload(),
      applyResolutions: true,
      config: getDefaultCodeflowConfig(),
      sessionState: humanSession,
      resolveThread: async (options) => ({
        threadId: options.threadId,
        classification: 'valid',
        status: 'resolved',
        resolved: true,
      }),
    });

    expect(result.status).toBe('applied');
    expect(result.lifecyclePhase).toBe('verified');
    expect(partial.status).toBe('applied');
    expect(partial.lifecyclePhase).toBe('review_triage');
    expect(withHumanDecision.status).toBe('applied');
    expect(withHumanDecision.lifecyclePhase).toBe('review_triage');
  });

  it('moves needs_human and mutation failures to blocked', async () => {
    const needsHuman = await runFlowFixComments({
      payload: payload({ classification: 'needs_human', commitSha: undefined, fixSummary: undefined, humanDecision: 'Decision required.', resolveRequested: false }),
      apply: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session('needs_human'),
    });
    const failedMutation = await runFlowFixComments({
      payload: payload({ resolveRequested: false }),
      applyReplies: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session(),
      replyToThread: async () => {
        throw new Error('permission denied');
      },
    });

    expect(needsHuman.lifecyclePhase).toBe('blocked');
    expect(failedMutation.lifecyclePhase).toBe('blocked');
    expect(failedMutation.status).toBe('failed');
  });
});
