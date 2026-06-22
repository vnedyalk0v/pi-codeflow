import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CodeflowReviewFixError,
  getDefaultCodeflowConfig,
  parseFlowFixCommentsArguments,
  runFlowFixComments,
  type CodeflowReviewFixPayload,
  type FlowFixCommentsResult,
} from '../../src/index';
import { registerCodeflowExtension } from '../../src/extension';
import {
  createCodeflowSessionState,
  type CodeflowSessionState,
} from '../../src/state/session-state';

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

function session(options: {
  phase?: CodeflowSessionState['lifecycle']['phase'];
  classification?: string;
  requiresHumanDecision?: boolean;
  isResolved?: boolean;
  isOutdated?: boolean;
  reviewStatus?: 'found' | 'none' | 'failed';
  checkStatus?: 'passed' | 'failed' | 'no_checks';
} = {}): CodeflowSessionState {
  const state = createCodeflowSessionState({ phase: options.phase ?? 'review_triage' });
  state.pullRequests.lastPullRequest = {
    number: 123,
    url: 'https://github.com/org/repo/pull/123',
    baseBranch: 'dev',
    headBranch: 'feat/comments',
    title: 'feat: comments',
    draft: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  state.reviewComments = {
    lastRun: {
      status: options.reviewStatus ?? 'found',
      prNumber: 123,
      prUrl: 'https://github.com/org/repo/pull/123',
      unresolvedOnly: true,
      includeOutdated: false,
      fetchedThreadCount: 1,
      filteredThreadCount: 1,
      classificationCounts: { [options.classification ?? 'valid']: 1 },
      requiresHumanDecisionCount: options.requiresHumanDecision ? 1 : 0,
      threads: [
        {
          threadId: 'PRRT_thread_1',
          path: 'src/example.ts',
          line: 1,
          isResolved: options.isResolved ?? false,
          isOutdated: options.isOutdated ?? false,
          author: 'alice',
          latestCommentSummary: 'Please fix this.',
          latestCommentId: 'PRRC_review_1',
          classification: options.classification ?? 'valid',
          requiresHumanDecision: options.requiresHumanDecision ?? false,
          canResolveAfterChecks: !options.requiresHumanDecision,
        },
      ],
      summary: 'triage summary',
      checkedAt: '2026-01-01T00:00:00.000Z',
    },
  };
  state.checks.lastRun = {
    status: options.checkStatus ?? 'passed',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:00.000Z',
    durationMs: 60_000,
    results: [],
  };
  state.commits.lastCommit = {
    sha: 'abc1234',
    branch: 'feat/comments',
    title: 'fix: review comments',
    type: 'fix',
    scope: null,
    summary: 'Fix review comments.',
    refs: ['#14'],
    committedAt: '2026-01-01T00:00:30.000Z',
  };
  return state;
}

describe('parseFlowFixCommentsArguments', () => {
  it('parses payload, dry-run, apply, PR, detached, and override flags', () => {
    expect(parseFlowFixCommentsArguments('--dry-run --payload .pi/codeflow/review-comment-fix.json --pr 123 --apply-replies --apply-resolutions --allow-invalid-resolution --detached')).toEqual({
      dryRun: true,
      applyReplies: true,
      applyResolutions: true,
      apply: false,
      allowInvalidResolution: true,
      detached: true,
      pr: 123,
      payloadPath: '.pi/codeflow/review-comment-fix.json',
    });
    expect(parseFlowFixCommentsArguments('--apply --payload fix.json')).toMatchObject({
      apply: true,
      applyReplies: true,
      applyResolutions: true,
      payloadPath: 'fix.json',
    });
  });

  it('rejects unknown flags and freeform arguments', () => {
    expect(() => parseFlowFixCommentsArguments('--merge')).toThrow(CodeflowReviewFixError);
    expect(() => parseFlowFixCommentsArguments('gh api graphql')).toThrow(CodeflowReviewFixError);
  });
});

describe('runFlowFixComments', () => {
  it('dry-run plans replies and resolutions without mutations', async () => {
    const calls: string[] = [];
    const result = await runFlowFixComments({
      payload: payload(),
      dryRun: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session(),
      replyToThread: async () => {
        calls.push('reply');
        throw new Error('not called');
      },
      resolveThread: async () => {
        calls.push('resolve');
        throw new Error('not called');
      },
    });

    expect(calls).toEqual([]);
    expect(result.status).toBe('dry_run');
    expect(result.replies[0]?.status).toBe('planned');
    expect(result.resolutions[0]?.status).toBe('planned');
    expect(result.sessionState.reviewFix?.lastRun?.status).toBe('dry_run');
  });

  it('accepts thread IDs from a complete /flow-comments scan with stored triage metadata', async () => {
    const calls: string[] = [];
    const state = session();
    state.reviewComments!.lastRun!.filteredThreadCount = 60;
    state.reviewComments!.lastRun!.threadIds = ['PRRT_thread_1', 'PRRT_thread_2'];
    state.reviewComments!.lastRun!.threads.push({
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
    const result = await runFlowFixComments({
      payload: payload({ threadId: 'PRRT_thread_2', resolveRequested: false }),
      applyReplies: true,
      config: getDefaultCodeflowConfig(),
      sessionState: state,
      replyToThread: async (options) => {
        calls.push(`reply:${options.threadId}`);
        return { threadId: options.threadId, classification: 'valid', status: 'posted', commentId: 'PRRC_reply_2', url: null, body: options.body };
      },
    });

    expect(calls).toEqual(['reply:PRRT_thread_2']);
    expect(result.status).toBe('applied');
  });

  it('blocks mutating thread IDs without stored triage metadata', async () => {
    const calls: string[] = [];
    const state = session();
    state.reviewComments!.lastRun!.filteredThreadCount = 60;
    state.reviewComments!.lastRun!.threadIds = ['PRRT_thread_1', 'PRRT_thread_2'];
    const result = await runFlowFixComments({
      payload: payload({ threadId: 'PRRT_thread_2', resolveRequested: false }),
      applyReplies: true,
      config: getDefaultCodeflowConfig(),
      sessionState: state,
      replyToThread: async () => {
        calls.push('reply');
        throw new Error('reply should not be called');
      },
    });

    expect(calls).toEqual([]);
    expect(result.status).toBe('blocked');
    expect(result.blocked[0]?.reason).toContain('/flow-comments ID metadata');
  });

  it('blocks when /flow-comments state belongs to a different PR', async () => {
    const calls: string[] = [];
    const state = session();
    state.reviewComments!.lastRun!.prNumber = 456;
    const result = await runFlowFixComments({
      payload: payload(),
      applyResolutions: true,
      config: getDefaultCodeflowConfig(),
      sessionState: state,
      replyToThread: async () => {
        calls.push('reply');
        throw new Error('reply should not be called');
      },
      resolveThread: async () => {
        calls.push('resolve');
        throw new Error('resolve should not be called');
      },
    });

    expect(calls).toEqual([]);
    expect(result.status).toBe('blocked');
    expect(result.blocked[0]?.reason).toContain('belongs to PR #456, not PR #123');
  });

  it('rejects explicit PR mismatches before detached mutations', async () => {
    const calls: string[] = [];

    await expect(runFlowFixComments({
      payload: { ...payload(), prNumber: 456 },
      pr: 123,
      detached: true,
      applyReplies: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session(),
      replyToThread: async () => {
        calls.push('reply');
        throw new Error('reply should not be called');
      },
    })).rejects.toThrow('--pr 123 does not match payload.prNumber 456');

    expect(calls).toEqual([]);
  });

  it('apply replies posts only allowed replies and stays in review triage', async () => {
    const calls: string[] = [];
    let postedBody = '';
    const result = await runFlowFixComments({
      payload: payload({ resolveRequested: false }),
      applyReplies: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session(),
      replyToThread: async (options) => {
        calls.push(`reply:${options.threadId}`);
        postedBody = options.body;
        return { threadId: options.threadId, classification: 'valid', status: 'posted', commentId: 'PRRC_reply_1', url: 'https://example.test', body: options.body };
      },
    });

    expect(calls).toEqual(['reply:PRRT_thread_1']);
    expect(result.status).toBe('applied');
    expect(result.lifecyclePhase).toBe('review_triage');
    expect(result.replies[0]?.status).toBe('posted');
    expect(result.resolutions).toEqual([]);
    expect(postedBody).not.toContain('I am resolving this thread');
    expect(postedBody).toContain('leaving this thread unresolved');
  });

  it('allows another reply after /flow-comments sees newer thread feedback', async () => {
    const prior = session();
    prior.reviewFix!.lastRun = {
      status: 'applied',
      prNumber: 123,
      checkedAt: '2026-01-01T00:02:00.000Z',
      repliesPosted: [{
        threadId: 'PRRT_thread_1',
        classification: 'valid',
        commentId: 'PRRC_reply_1',
        url: null,
        repliedToCommentId: 'PRRC_review_1',
      }],
      threadsResolved: [],
      blocked: [],
      requiresHumanDecision: [],
      summary: 'Replied to PRRT_thread_1.',
    };

    const duplicate = await runFlowFixComments({
      payload: payload({ resolveRequested: false }),
      applyReplies: true,
      config: getDefaultCodeflowConfig(),
      sessionState: prior,
      replyToThread: async () => {
        throw new Error('duplicate reply should not be posted');
      },
    });
    expect(duplicate.replies[0]?.status).toBe('skipped');

    prior.reviewComments!.lastRun!.threads[0]!.latestCommentId = 'PRRC_review_2';
    const calls: string[] = [];
    const refreshed = await runFlowFixComments({
      payload: payload({ resolveRequested: false }),
      applyReplies: true,
      config: getDefaultCodeflowConfig(),
      sessionState: prior,
      replyToThread: async (options) => {
        calls.push(`reply:${options.threadId}`);
        return { threadId: options.threadId, classification: 'valid', status: 'posted', commentId: 'PRRC_reply_2', url: null, body: options.body };
      },
    });

    expect(calls).toEqual(['reply:PRRT_thread_1']);
    expect(refreshed.replies[0]?.status).toBe('posted');
    expect(refreshed.sessionState.reviewFix?.lastRun?.repliesPosted[0]?.repliedToCommentId).toBe('PRRC_review_2');
  });

  it('posts reply-only applies even when resolution gates would fail', async () => {
    const calls: string[] = [];
    const result = await runFlowFixComments({
      payload: payload(),
      applyReplies: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session({ checkStatus: 'failed' }),
      replyToThread: async (options) => {
        calls.push(`reply:${options.threadId}`);
        return { threadId: options.threadId, classification: 'valid', status: 'posted', commentId: 'PRRC_reply_1', url: null, body: options.body };
      },
    });

    expect(calls).toEqual(['reply:PRRT_thread_1']);
    expect(result.status).toBe('applied');
    expect(result.blocked).toEqual([]);
  });

  it('honors explicit reply-only apply when auto-resolve is enabled', async () => {
    const calls: string[] = [];
    const config = getDefaultCodeflowConfig();
    config.reviewComments.autoResolve = true;
    const result = await runFlowFixComments({
      payload: payload(),
      applyReplies: true,
      config,
      sessionState: session(),
      replyToThread: async (options) => {
        calls.push(`reply:${options.threadId}`);
        return { threadId: options.threadId, classification: 'valid', status: 'posted', commentId: 'PRRC_reply_1', url: 'https://example.test', body: options.body };
      },
      resolveThread: async () => {
        calls.push('resolve');
        throw new Error('resolve should not be called');
      },
    });

    expect(calls).toEqual(['reply:PRRT_thread_1']);
    expect(result.status).toBe('applied');
    expect(result.resolutions).toEqual([]);
  });

  it('records reply render failures before mutation state is lost', async () => {
    const calls: string[] = [];
    const state = session();
    state.reviewComments!.lastRun!.threads.push({
      threadId: 'PRRT_thread_2',
      path: 'src/example.ts',
      line: 2,
      isResolved: false,
      isOutdated: false,
      author: 'alice',
      latestCommentSummary: 'Please fix this too.',
      classification: 'valid',
      requiresHumanDecision: false,
      canResolveAfterChecks: true,
    });
    const result = await runFlowFixComments({
      payload: {
        prNumber: 123,
        items: [
          payload({ resolveRequested: false }).items[0]!,
          {
            ...payload({ threadId: 'PRRT_thread_2', resolveRequested: false }).items[0]!,
            verification: Array.from({ length: 12 }, (_, index) => `check ${index} ${'x'.repeat(500)}`),
          },
        ],
      },
      applyReplies: true,
      config: getDefaultCodeflowConfig(),
      sessionState: state,
      replyToThread: async (options) => {
        calls.push(`reply:${options.threadId}`);
        return { threadId: options.threadId, classification: 'valid', status: 'posted', commentId: 'PRRC_reply_1', url: null, body: options.body };
      },
    });

    expect(calls).toEqual(['reply:PRRT_thread_1']);
    expect(result.status).toBe('blocked');
    expect(result.blocked[0]?.threadId).toBe('PRRT_thread_2');
    expect(result.blocked[0]?.reason).toContain('exceeds');
    expect(result.sessionState.reviewFix?.lastRun?.blocked[0]?.threadId).toBe('PRRT_thread_2');
  });

  it('apply resolutions resolves only allowed threads without rendering replies', async () => {
    const calls: string[] = [];
    const badTemplateDir = await mkdtemp(path.join(os.tmpdir(), 'flow-fix-comments-template-dir-'));
    const config = getDefaultCodeflowConfig();
    config.reviewComments.autoReply = true;
    config.reviewComments.replyTemplate = badTemplateDir;
    const result = await runFlowFixComments({
      payload: payload(),
      applyResolutions: true,
      config,
      sessionState: session(),
      resolveThread: async (options) => {
        calls.push(`resolve:${options.threadId}`);
        return { threadId: options.threadId, classification: 'valid', status: 'resolved', resolved: true };
      },
    });

    expect(calls).toEqual(['resolve:PRRT_thread_1']);
    expect(result.status).toBe('applied');
    expect(result.resolutions[0]?.status).toBe('resolved');
    expect(result.replies).toEqual([]);
  });

  it('resolves GitHub-outdated stale threads without redundant text evidence', async () => {
    const calls: string[] = [];
    const result = await runFlowFixComments({
      payload: payload({ classification: 'stale', commitSha: undefined, fixSummary: undefined }),
      applyResolutions: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session({ classification: 'stale', isOutdated: true }),
      resolveThread: async (options) => {
        calls.push(`resolve:${options.threadId}`);
        return { threadId: options.threadId, classification: 'stale', status: 'resolved', resolved: true };
      },
    });

    expect(calls).toEqual(['resolve:PRRT_thread_1']);
    expect(result.status).toBe('applied');
  });

  it('treats unresolved mutation results as failed and blocked', async () => {
    const result = await runFlowFixComments({
      payload: payload(),
      applyResolutions: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session(),
      resolveThread: async (options) => ({
        threadId: options.threadId,
        classification: 'valid',
        status: 'failed',
        resolved: false,
        reason: 'GitHub did not report the thread as resolved.',
      }),
    });

    expect(result.status).toBe('failed');
    expect(result.lifecyclePhase).toBe('blocked');
    expect(result.blocked[0]?.reason).toContain('did not report');
    expect(result.sessionState.reviewFix?.lastRun?.status).toBe('failed');
  });

  it('apply calls reply before resolve when both are allowed', async () => {
    const calls: string[] = [];
    const result = await runFlowFixComments({
      payload: payload(),
      apply: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session(),
      replyToThread: async (options) => {
        calls.push(`reply:${options.threadId}`);
        return { threadId: options.threadId, classification: 'valid', status: 'posted', commentId: 'PRRC_reply_1', url: null, body: options.body };
      },
      resolveThread: async (options) => {
        calls.push(`resolve:${options.threadId}`);
        return { threadId: options.threadId, classification: 'valid', status: 'resolved', resolved: true };
      },
    });

    expect(calls).toEqual(['reply:PRRT_thread_1', 'resolve:PRRT_thread_1']);
    expect(result.status).toBe('applied');
  });

  it('preserves blockers and human decisions even in dry-run', async () => {
    const needsHuman = await runFlowFixComments({
      payload: payload({ classification: 'needs_human', commitSha: undefined, fixSummary: undefined, humanDecision: 'Decision needed.', resolveRequested: false }),
      dryRun: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session({ classification: 'needs_human', requiresHumanDecision: true }),
    });
    const incomplete = await runFlowFixComments({
      payload: payload(),
      dryRun: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session({ reviewStatus: 'failed' }),
    });

    expect(needsHuman.status).toBe('blocked');
    expect(needsHuman.lifecyclePhase).toBe('blocked');
    expect(needsHuman.nextExpectedActions.join('\n')).toContain('human review decision');
    expect(incomplete.status).toBe('blocked');
    expect(incomplete.nextExpectedActions.join('\n')).toContain('blocked verification or policy');
  });

  it('blocks needs_human, incomplete scans, and failed checks', async () => {
    const needsHuman = await runFlowFixComments({
      payload: payload({ classification: 'needs_human', commitSha: undefined, fixSummary: undefined, humanDecision: 'Decision needed.', resolveRequested: false }),
      apply: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session({ classification: 'needs_human', requiresHumanDecision: true }),
    });
    const incomplete = await runFlowFixComments({
      payload: payload(),
      apply: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session({ reviewStatus: 'failed' }),
    });
    const failedChecks = await runFlowFixComments({
      payload: payload(),
      applyResolutions: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session({ checkStatus: 'failed' }),
    });

    expect(needsHuman.status).toBe('blocked');
    expect(needsHuman.requiresHumanDecision).toEqual(['PRRT_thread_1']);
    expect(incomplete.status).toBe('blocked');
    expect(incomplete.blocked[0]?.reason).toContain('incomplete');
    expect(failedChecks.status).toBe('blocked');
    expect(failedChecks.blocked[0]?.reason).toContain('not passed');
  });

  it('skips already-resolved threads without mutations', async () => {
    const calls: string[] = [];
    const result = await runFlowFixComments({
      payload: payload(),
      apply: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session({ isResolved: true }),
      replyToThread: async () => {
        calls.push('reply');
        throw new Error('not called');
      },
      resolveThread: async () => {
        calls.push('resolve');
        throw new Error('not called');
      },
    });

    expect(calls).toEqual([]);
    expect(result.replies[0]?.status).toBe('skipped');
    expect(result.resolutions[0]?.status).toBe('skipped');
  });

  it('skips session-recorded resolved threads when latest triage still shows resolved', async () => {
    const calls: string[] = [];
    const state = session({ isResolved: true });
    state.reviewFix!.lastRun = {
      status: 'applied',
      prNumber: 123,
      checkedAt: '2026-01-01T00:02:00.000Z',
      repliesPosted: [],
      threadsResolved: [{ threadId: 'PRRT_thread_1', classification: 'valid' }],
      blocked: [],
      requiresHumanDecision: [],
      summary: 'Resolved PRRT_thread_1.',
    };

    const result = await runFlowFixComments({
      payload: payload(),
      applyResolutions: true,
      config: getDefaultCodeflowConfig(),
      sessionState: state,
      resolveThread: async () => {
        calls.push('resolve');
        throw new Error('not called');
      },
    });

    expect(calls).toEqual([]);
    expect(result.status).toBe('dry_run');
    expect(result.resolutions[0]?.status).toBe('skipped');
    expect(result.resolutions[0]?.reason).toContain('already resolved in this Codeflow session');
    expect(result.warnings.join('\n')).toContain('Skipping duplicate resolution');
  });

  it('lets fresh unresolved triage override session-recorded resolved threads', async () => {
    const calls: string[] = [];
    const state = session({ isResolved: false });
    state.reviewFix!.lastRun = {
      status: 'applied',
      prNumber: 123,
      checkedAt: '2026-01-01T00:02:00.000Z',
      repliesPosted: [],
      threadsResolved: [{ threadId: 'PRRT_thread_1', classification: 'valid' }],
      blocked: [],
      requiresHumanDecision: [],
      summary: 'Resolved PRRT_thread_1.',
    };

    const result = await runFlowFixComments({
      payload: payload({ resolveRequested: false }),
      applyReplies: true,
      config: getDefaultCodeflowConfig(),
      sessionState: state,
      replyToThread: async (options) => {
        calls.push(`reply:${options.threadId}`);
        return { threadId: options.threadId, classification: 'valid', status: 'posted', commentId: 'PRRC_reply_1', url: null, body: options.body };
      },
    });

    expect(calls).toEqual(['reply:PRRT_thread_1']);
    expect(result.status).toBe('applied');
  });

  it('does not commit, push, merge, approve, delete branches, or rerun workflows', async () => {
    const calls: string[] = [];
    await runFlowFixComments({
      payload: payload(),
      apply: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session(),
      replyToThread: async (options) => {
        calls.push(`addPullRequestReviewThreadReply:${options.threadId}`);
        return { threadId: options.threadId, classification: 'valid', status: 'posted', commentId: 'PRRC_reply_1', url: null, body: options.body };
      },
      resolveThread: async (options) => {
        calls.push(`resolveReviewThread:${options.threadId}`);
        return { threadId: options.threadId, classification: 'valid', status: 'resolved', resolved: true };
      },
    });

    const flat = calls.join(' ').toLowerCase();
    expect(flat).not.toMatch(/commit|push|merge|approve|delete|rerun|workflow/);
  });
});

describe('/flow-fix-comments command registration', () => {
  it('registers the command and passes parsed payload with session state', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'flow-fix-comments-'));
    const payloadPath = path.join(tmp, 'fix.json');
    await writeFile(payloadPath, JSON.stringify(payload()), 'utf8');
    const notifications: Array<{ message: string; level: string }> = [];
    const handlers = new Map<string, (args: string, context: { cwd: string; ui: { notify: (message: string, level: 'info' | 'warning' | 'error') => void } }) => Promise<unknown>>();
    let receivedOptions: unknown;

    registerCodeflowExtension(
      {
        on() {},
        registerCommand(name, options) {
          handlers.set(name, options.handler);
        },
      },
      {
        runFlowFixComments: async (options) => {
          receivedOptions = options;
          return {
            status: 'dry_run',
            prNumber: options.pr as number,
            replies: [],
            resolutions: [],
            blocked: [],
            requiresHumanDecision: [],
            summary: 'Codeflow review fix dry-run.',
            warnings: [],
            lifecyclePhase: 'review_triage',
            nextExpectedActions: ['Review plan.'],
            sessionState: createCodeflowSessionState({ phase: 'review_triage' }),
          } satisfies FlowFixCommentsResult;
        },
      },
    );

    const result = await handlers.get('flow-fix-comments')?.(`--dry-run --pr 123 --payload ${payloadPath}`, {
      cwd: tmp,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    }) as FlowFixCommentsResult;

    expect(result.lifecyclePhase).toBe('review_triage');
    expect(receivedOptions).toMatchObject({
      cwd: tmp,
      dryRun: true,
      pr: 123,
      payload: payload(),
    });
    expect(notifications[0]?.message).toContain('dry-run');
  });
});
