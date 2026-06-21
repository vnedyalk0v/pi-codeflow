import { describe, expect, it } from 'vitest';

import { getDefaultCodeflowConfig, type CodeflowReviewFixItem } from '../../src/index';
import { evaluateReviewResolutionPolicy } from '../../src/review-comments/review-resolution-policy';
import type { CodeflowStoredCheckRun } from '../../src/state/check-state';
import type { CodeflowStoredCommit } from '../../src/state/commit-state';
import type { CodeflowStoredReviewCommentThread } from '../../src/state/review-comments-state';

function item(overrides: Partial<CodeflowReviewFixItem> = {}): CodeflowReviewFixItem {
  return {
    threadId: 'PRRT_thread_1',
    classification: 'valid',
    fixSummary: 'Fixed the issue.',
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

function checks(
  status: CodeflowStoredCheckRun['status'],
  finishedAt = '2026-01-01T00:01:00.000Z',
): CodeflowStoredCheckRun {
  return {
    status,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt,
    durationMs: 60_000,
    results: [],
  };
}

function commit(overrides: Partial<CodeflowStoredCommit> = {}): CodeflowStoredCommit {
  return {
    sha: 'abc1234',
    branch: 'feat/comments',
    title: 'fix: review comment',
    type: 'fix',
    scope: null,
    summary: 'Fix review comment.',
    refs: ['#14'],
    committedAt: '2026-01-01T00:02:00.000Z',
    ...overrides,
  };
}

const config = getDefaultCodeflowConfig();

describe('evaluateReviewResolutionPolicy', () => {
  it('requires explicit resolution requests and passed checks', () => {
    const notRequested = evaluateReviewResolutionPolicy({
      item: item({ resolveRequested: false }),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('passed'),
    });
    const failed = evaluateReviewResolutionPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('failed'),
    });

    expect(notRequested.allowed).toBe(false);
    expect(notRequested.blockedReasons.join('\n')).toContain('not requested');
    expect(failed.allowed).toBe(false);
    expect(failed.blockedReasons.join('\n')).toContain('not passed');
  });

  it('allows payload verification evidence only when no check state exists', () => {
    const missingState = evaluateReviewResolutionPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: null,
    });
    const failedState = evaluateReviewResolutionPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('failed'),
    });

    expect(missingState.allowed).toBe(true);
    expect(missingState.warnings.join('\n')).toContain('payload checksRun');
    expect(failedState.allowed).toBe(false);
  });

  it('blocks resolution when the latest checks cannot be tied to the fix commit', () => {
    const missingCommit = evaluateReviewResolutionPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('passed', '2026-01-01T00:03:00.000Z'),
      latestCommit: null,
    });
    const mismatchedCommit = evaluateReviewResolutionPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('passed', '2026-01-01T00:03:00.000Z'),
      latestCommit: commit({ sha: 'def5678' }),
    });
    const shortShaMatch = evaluateReviewResolutionPolicy({
      item: item({ commitSha: 'abc1234' }),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('passed', '2026-01-01T00:03:00.000Z'),
      latestCommit: commit({ sha: `abc1234${'0'.repeat(33)}` }),
    });
    const staleWithoutCommit = evaluateReviewResolutionPolicy({
      item: item({ classification: 'stale', commitSha: undefined }),
      config: config.reviewComments,
      knownThread: thread({ classification: 'stale', isOutdated: true }),
      latestCheckRun: checks('passed', '2026-01-01T00:03:00.000Z'),
      latestCommit: null,
    });

    expect(missingCommit.allowed).toBe(false);
    expect(missingCommit.blockedReasons.join('\n')).toContain('/flow-commit state is missing');
    expect(mismatchedCommit.allowed).toBe(false);
    expect(mismatchedCommit.blockedReasons.join('\n')).toContain('does not match requested fix commit');
    expect(shortShaMatch.allowed).toBe(true);
    expect(staleWithoutCommit.allowed).toBe(true);
  });

  it('blocks resolution when the latest checks predate the fix commit', () => {
    const result = evaluateReviewResolutionPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('passed', '2026-01-01T00:01:00.000Z'),
      latestCommit: commit({ committedAt: '2026-01-01T00:02:00.000Z' }),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockedReasons.join('\n')).toContain('finished before the fix commit');
  });

  it('blocks stale resolution without outdated state or evidence', () => {
    const result = evaluateReviewResolutionPolicy({
      item: item({ classification: 'stale', commitSha: undefined, fixSummary: undefined }),
      config: config.reviewComments,
      knownThread: thread({ classification: 'stale', isOutdated: false }),
      latestCheckRun: checks('passed'),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockedReasons.join('\n')).toContain('stale');
  });

  it('blocks GitHub checks from a different PR before resolution', () => {
    const result = evaluateReviewResolutionPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('passed'),
      latestCommit: commit(),
      prNumber: 123,
      latestGitHubChecksRun: {
        status: 'passed',
        prNumber: 456,
        prUrl: null,
        requiredOnly: true,
        watched: true,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:01:00.000Z',
        durationMs: 60_000,
        checks: [],
        summary: 'passed',
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.blockedReasons.join('\n')).toContain('not PR #123');
  });

  it('blocks GitHub checks that predate the fix commit', () => {
    const staleByTime = evaluateReviewResolutionPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('passed', '2026-01-01T00:03:00.000Z'),
      latestCommit: commit({ committedAt: '2026-01-01T00:02:00.000Z' }),
      prNumber: 123,
      latestGitHubChecksRun: {
        status: 'passed',
        prNumber: 123,
        prUrl: null,
        requiredOnly: true,
        watched: true,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:01:00.000Z',
        durationMs: 60_000,
        checks: [],
        summary: 'passed',
      },
    });
    const currentByHeadSha = evaluateReviewResolutionPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('passed', '2026-01-01T00:03:00.000Z'),
      latestCommit: commit({ committedAt: '2026-01-01T00:02:00.000Z' }),
      prNumber: 123,
      latestGitHubChecksRun: {
        status: 'passed',
        prNumber: 123,
        prUrl: null,
        headSha: 'abc1234',
        requiredOnly: true,
        watched: true,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:01:00.000Z',
        durationMs: 60_000,
        checks: [],
        summary: 'passed',
      },
    });
    const mismatchedHeadSha = evaluateReviewResolutionPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('passed', '2026-01-01T00:03:00.000Z'),
      latestCommit: commit({ committedAt: '2026-01-01T00:02:00.000Z' }),
      prNumber: 123,
      latestGitHubChecksRun: {
        status: 'passed',
        prNumber: 123,
        prUrl: null,
        headSha: 'def5678',
        requiredOnly: true,
        watched: true,
        startedAt: '2026-01-01T00:02:30.000Z',
        finishedAt: '2026-01-01T00:03:00.000Z',
        durationMs: 30_000,
        checks: [],
        summary: 'passed',
      },
    });

    expect(staleByTime.allowed).toBe(false);
    expect(staleByTime.blockedReasons.join('\n')).toContain('finished before the fix commit');
    expect(currentByHeadSha.allowed).toBe(true);
    expect(mismatchedHeadSha.allowed).toBe(false);
    expect(mismatchedHeadSha.blockedReasons.join('\n')).toContain('does not match requested fix commit');
  });

  it.each(['failed', 'pending', 'no_checks', 'unknown'] as const)('blocks %s GitHub checks before resolution', (status) => {
    const result = evaluateReviewResolutionPolicy({
      item: item(),
      config: config.reviewComments,
      knownThread: thread(),
      latestCheckRun: checks('passed'),
      latestCommit: commit(),
      prNumber: 123,
      latestGitHubChecksRun: {
        status,
        prNumber: 123,
        prUrl: null,
        requiredOnly: true,
        watched: true,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:01:00.000Z',
        durationMs: 60_000,
        checks: [],
        summary: status,
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.blockedReasons.join('\n')).toContain('GitHub checks');
  });
});
