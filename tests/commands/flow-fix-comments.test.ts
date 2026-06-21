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

  it('apply replies posts only allowed replies and stays in review triage', async () => {
    const calls: string[] = [];
    const result = await runFlowFixComments({
      payload: payload({ resolveRequested: false }),
      applyReplies: true,
      config: getDefaultCodeflowConfig(),
      sessionState: session(),
      replyToThread: async (options) => {
        calls.push(`reply:${options.threadId}`);
        return { threadId: options.threadId, classification: 'valid', status: 'posted', commentId: 'PRRC_reply_1', url: 'https://example.test', body: options.body };
      },
    });

    expect(calls).toEqual(['reply:PRRT_thread_1']);
    expect(result.status).toBe('applied');
    expect(result.lifecyclePhase).toBe('review_triage');
    expect(result.replies[0]?.status).toBe('posted');
    expect(result.resolutions).toEqual([]);
  });

  it('apply resolutions resolves only allowed threads without rendering replies', async () => {
    const calls: string[] = [];
    const badTemplateDir = await mkdtemp(path.join(os.tmpdir(), 'flow-fix-comments-template-dir-'));
    const config = getDefaultCodeflowConfig();
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
