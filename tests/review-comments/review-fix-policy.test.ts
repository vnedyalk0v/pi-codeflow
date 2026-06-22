import { describe, expect, it } from 'vitest';

import {
  evaluateReviewFixPolicy,
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  type CodeflowReviewFixItem,
} from '../../src/index';
import type { CodeflowStoredCheckRun } from '../../src/state/check-state';
import type { CodeflowStoredCommit } from '../../src/state/commit-state';
import type { CodeflowStoredReviewCommentThread } from '../../src/state/review-comments-state';

function item(overrides: Partial<CodeflowReviewFixItem> = {}): CodeflowReviewFixItem {
  return {
    threadId: 'PRRT_thread_1',
    classification: 'valid',
    fixSummary: 'Fixed the reported issue.',
    verification: ['npm test passed'],
    checksRun: ['npm test'],
    commitSha: 'abc1234',
    resolveRequested: true,
    ...overrides,
  };
}

function thread(overrides: Partial<CodeflowStoredReviewCommentThread> = {}): CodeflowStoredReviewCommentThread {
  return {
    threadId: 'PRRT_thread_1',
    path: 'src/example.ts',
    line: 1,
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

function checks(status: CodeflowStoredCheckRun['status']): CodeflowStoredCheckRun {
  return {
    status,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:00.000Z',
    durationMs: 60_000,
    results: [],
  };
}

function commit(): CodeflowStoredCommit {
  return {
    sha: 'abc1234',
    branch: 'feat/comments',
    title: 'fix: comments',
    type: 'fix',
    scope: null,
    summary: 'Fix comments.',
    refs: ['#14'],
    committedAt: '2026-01-01T00:00:30.000Z',
  };
}

const config = getDefaultCodeflowConfig();

describe('evaluateReviewFixPolicy', () => {
  it('allows valid replies and resolution with passed checks and commitSha', () => {
    const result = evaluateReviewFixPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('passed'),
      latestCommit: commit(),
    });

    expect(result.canReply).toBe(true);
    expect(result.canResolve).toBe(true);
    expect(result.blockedReasons).toEqual([]);
  });

  it('blocks valid resolution with failed checks or missing commitSha', () => {
    const failedChecks = evaluateReviewFixPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('failed'),
    });
    const noSha = evaluateReviewFixPolicy({
      item: item({ commitSha: undefined }),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('passed'),
    });

    expect(failedChecks.canResolve).toBe(false);
    expect(failedChecks.blockedReasons.join('\n')).toContain('not passed');
    expect(noSha.canResolve).toBe(false);
    expect(noSha.blockedReasons.join('\n')).toContain('commitSha');
  });

  it('does not let resolution blockers suppress reply policy', () => {
    const replyOnly = evaluateReviewFixPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('failed'),
      includeResolutionPolicy: false,
    });
    const withBlockedResolution = evaluateReviewFixPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('failed'),
    });

    expect(replyOnly.canReply).toBe(true);
    expect(replyOnly.canResolve).toBe(false);
    expect(replyOnly.blockedReasons).toEqual([]);
    expect(withBlockedResolution.canReply).toBe(true);
    expect(withBlockedResolution.canResolve).toBe(false);
    expect(withBlockedResolution.blockedReasons.join('\n')).toContain('not passed');
  });

  it('allows already_fixed and stale resolution when config allows them', () => {
    const alreadyFixed = evaluateReviewFixPolicy({
      item: item({ classification: 'already_fixed', commitSha: undefined }),
      config: config.reviewComments,
      knownThread: thread({ classification: 'already_fixed' }),
      latestCheckRun: checks('passed'),
    });
    const stale = evaluateReviewFixPolicy({
      item: item({ classification: 'stale', commitSha: undefined, fixSummary: 'GitHub marks the thread outdated.' }),
      config: config.reviewComments,
      knownThread: thread({ classification: 'stale', isOutdated: true }),
      latestCheckRun: checks('passed'),
    });

    expect(alreadyFixed.canResolve).toBe(true);
    expect(stale.canResolve).toBe(true);
  });

  it('blocks invalid resolution by default but allows non-resolving replies', () => {
    const resolvingInvalid = evaluateReviewFixPolicy({
      item: item({
        classification: 'invalid',
        commitSha: undefined,
        fixSummary: 'The current code does not have this path.',
        resolveRequested: true,
      }),
      config: config.reviewComments,
      knownThread: thread({ classification: 'invalid' }),
      latestCheckRun: checks('passed'),
    });
    const replyOnlyInvalid = evaluateReviewFixPolicy({
      item: item({
        classification: 'invalid',
        commitSha: undefined,
        fixSummary: 'The current code does not have this path.',
        resolveRequested: false,
      }),
      config: config.reviewComments,
      knownThread: thread({ classification: 'invalid' }),
      latestCheckRun: checks('passed'),
    });

    expect(resolvingInvalid.canResolve).toBe(false);
    expect(resolvingInvalid.blockedReasons.join('\n')).toContain('invalid threads cannot be resolved');
    expect(replyOnlyInvalid.canReply).toBe(true);
    expect(replyOnlyInvalid.canResolve).toBe(false);
  });

  it('can allow invalid resolution only with explicit override and policy support', () => {
    const relaxed = mergeCodeflowConfig(config, {
      reviewComments: {
        requireHumanForInvalid: false,
        autoResolveClassifications: ['invalid'],
      },
    });
    const result = evaluateReviewFixPolicy({
      item: item({ classification: 'invalid', commitSha: undefined, fixSummary: 'False positive.' }),
      config: relaxed.reviewComments,
      knownThread: thread({ classification: 'invalid' }),
      latestCheckRun: checks('passed'),
    });

    expect(result.canResolve).toBe(true);
  });

  it('always blocks needs_human and triage-required human decisions', () => {
    const needsHuman = evaluateReviewFixPolicy({
      item: item({ classification: 'needs_human', commitSha: undefined, resolveRequested: false, humanDecision: 'API decision.' }),
      config: config.reviewComments,
      knownThread: thread({ classification: 'needs_human' }),
      latestCheckRun: checks('passed'),
    });
    const triageHuman = evaluateReviewFixPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread({ requiresHumanDecision: true }),
      latestCheckRun: checks('passed'),
    });

    expect(needsHuman.canReply).toBe(false);
    expect(needsHuman.canResolve).toBe(false);
    expect(needsHuman.requiresHumanDecision).toBe(true);
    expect(triageHuman.canResolve).toBe(false);
    expect(triageHuman.requiresHumanDecision).toBe(true);
  });

  it('skips already-resolved threads', () => {
    const result = evaluateReviewFixPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread({ isResolved: true }),
      latestCheckRun: checks('passed'),
    });

    expect(result.shouldSkip).toBe(true);
    expect(result.canReply).toBe(false);
    expect(result.canResolve).toBe(false);
    expect(result.warnings.join('\n')).toContain('already resolved');
  });
});
