import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CodeflowReviewCommentsError,
  getDefaultCodeflowConfig,
  parseFlowCommentsArguments,
  runFlowComments,
  type FlowCommentsResult,
} from '../../src/index';
import { registerCodeflowExtension } from '../../src/extension';
import type { GhClientLike } from '../../src/github/gh-client';
import { GithubCliError } from '../../src/github/github-errors';
import { createCodeflowSessionState } from '../../src/state/session-state';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function fixture(name: string): string {
  return readFileSync(path.join(repoRoot, 'tests/fixtures/github', name), 'utf8');
}

function repoView() {
  return JSON.stringify({ nameWithOwner: 'org/repo', url: 'https://github.com/org/repo' });
}

function prView(number = 123) {
  return JSON.stringify({ number, url: `https://github.com/org/repo/pull/${number}` });
}

function ghClient(calls: string[][], outputs: Array<string | Error>): GhClientLike {
  return {
    run: async (args) => {
      calls.push(args);
      const next = outputs.shift();

      if (next instanceof Error) {
        throw next;
      }

      return { args, stdout: next ?? '{}', stderr: '' };
    },
  };
}

function sessionWithPr(number = 123) {
  const session = createCodeflowSessionState({ phase: 'verified' });
  session.pullRequests.lastPullRequest = {
    number,
    url: `https://github.com/org/repo/pull/${number}`,
    baseBranch: 'dev',
    headBranch: 'feat/comments',
    title: 'feat: comments',
    draft: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  return session;
}

describe('parseFlowCommentsArguments', () => {
  it('parses PR, modes, filters, triage payload, json, and dry-run flags', () => {
    expect(parseFlowCommentsArguments('--pr 123 --all --author coderabbitai --path src/foo.ts --include-outdated --max-threads 75 --triage-payload .pi/codeflow/review-comment-triage.json --json --dry-run')).toEqual({
      dryRun: true,
      json: true,
      pr: 123,
      unresolvedOnly: false,
      includeResolved: true,
      includeOutdated: true,
      authors: ['coderabbitai'],
      paths: ['src/foo.ts'],
      maxThreads: 75,
      triagePayloadPath: '.pi/codeflow/review-comment-triage.json',
    });
    expect(parseFlowCommentsArguments('--unresolved')).toEqual({
      dryRun: false,
      json: false,
      unresolvedOnly: true,
      includeResolved: false,
    });
  });

  it('rejects conflicting modes, unknown flags, and freeform arguments', () => {
    expect(() => parseFlowCommentsArguments('--all --unresolved')).toThrow(CodeflowReviewCommentsError);
    expect(() => parseFlowCommentsArguments('--merge')).toThrow(CodeflowReviewCommentsError);
    expect(() => parseFlowCommentsArguments('gh pr review')).toThrow(CodeflowReviewCommentsError);
  });
});

describe('runFlowComments', () => {
  it('supports dry-run without reading GitHub or updating lifecycle state', async () => {
    const calls: string[][] = [];
    const session = sessionWithPr(123);
    const result = await runFlowComments({
      dryRun: true,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient(calls, []),
      sessionState: session,
    });

    expect(calls).toEqual([]);
    expect(result.status).toBe('dry_run');
    expect(result.lifecyclePhase).toBe('verified');
    expect(result.sessionState).toBe(session);
    expect(result.summary).toContain('dry-run');
  });

  it('uses latest PR state when no explicit PR is provided', async () => {
    const calls: string[][] = [];
    const result = await runFlowComments({
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient(calls, [repoView(), prView(456), fixture('review-threads.graphql.json')]),
      sessionState: sessionWithPr(456),
    });

    expect(result.prNumber).toBe(456);
    expect(calls[1]).toEqual(['pr', 'view', '456', '--json', 'number,url']);
  });

  it('lists unresolved review threads by default and moves to review_triage', async () => {
    const result = await runFlowComments({
      pr: 123,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [repoView(), prView(), fixture('review-threads.graphql.json')]),
      sessionState: sessionWithPr(),
    });

    expect(result.status).toBe('found');
    expect(result.filteredThreads).toHaveLength(2);
    expect(result.lifecyclePhase).toBe('review_triage');
    expect(result.sessionState.reviewComments?.lastRun?.status).toBe('found');
  });

  it('supports all, author, path, and outdated filters', async () => {
    const all = await runFlowComments({
      pr: 123,
      includeResolved: true,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [repoView(), prView(), fixture('review-threads-resolved.graphql.json')]),
      sessionState: sessionWithPr(),
    });
    const authorPath = await runFlowComments({
      pr: 123,
      authors: ['alice'],
      paths: ['src/bar.ts'],
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [repoView(), prView(), fixture('review-threads.graphql.json')]),
      sessionState: sessionWithPr(),
    });
    const outdatedExcluded = await runFlowComments({
      pr: 123,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [repoView(), prView(), fixture('review-threads-outdated.graphql.json')]),
      sessionState: sessionWithPr(),
    });
    const outdatedIncluded = await runFlowComments({
      pr: 123,
      includeOutdated: true,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [repoView(), prView(), fixture('review-threads-outdated.graphql.json')]),
      sessionState: sessionWithPr(),
    });

    expect(all.filteredThreads).toHaveLength(1);
    expect(authorPath.filteredThreads.map((thread) => thread.threadId)).toEqual(['PRRT_thread_2']);
    expect(outdatedExcluded.status).toBe('none');
    expect(outdatedIncluded.status).toBe('found');
  });

  it('fails safely when the GitHub thread scan is truncated before selected threads are found', async () => {
    const raw = JSON.parse(fixture('review-threads-resolved.graphql.json'));
    raw.data.repository.pullRequest.reviewThreads.pageInfo = {
      hasNextPage: true,
      endCursor: 'next-thread-cursor',
    };
    const result = await runFlowComments({
      pr: 123,
      maxThreads: 1,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [repoView(), prView(), JSON.stringify(raw)]),
      sessionState: sessionWithPr(),
    });

    expect(result.status).toBe('failed');
    expect(result.incomplete).toBe(true);
    expect(result.lifecyclePhase).toBe('blocked');
    expect(result.summary).toContain('scan incomplete');
    expect(result.nextExpectedActions.join('\n')).toContain('do not claim there are no selected review threads');
  });

  it('validates structured triage payloads and updates counts', async () => {
    const result = await runFlowComments({
      pr: 123,
      triagePayload: {
        threads: [
          {
            threadId: 'PRRT_thread_1',
            classification: 'valid',
            confidence: 0.9,
            reason: 'Real issue.',
            recommendedAction: 'Fix it.',
            filesToInspect: ['src/foo.ts'],
            filesToChange: ['src/foo.ts'],
            checksToRun: ['npm test'],
            replyBody: 'Draft after fix.',
            canResolveAfterChecks: true,
            requiresHumanDecision: false,
          },
        ],
      },
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [repoView(), prView(), fixture('review-threads.graphql.json')]),
      sessionState: sessionWithPr(),
    });

    expect(result.triage?.classificationCounts.valid).toBe(1);
    expect(result.summary).toContain('triage summary');
    expect(result.sessionState.reviewComments?.lastRun?.classificationCounts.valid).toBe(1);
  });

  it('rejects triage payload IDs outside the selected filtered threads', async () => {
    await expect(runFlowComments({
      pr: 123,
      authors: ['alice'],
      triagePayload: {
        threads: [
          {
            threadId: 'PRRT_thread_1',
            classification: 'valid',
            confidence: 0.9,
            reason: 'Real issue.',
            recommendedAction: 'Fix it.',
            filesToInspect: ['src/foo.ts'],
            filesToChange: ['src/foo.ts'],
            checksToRun: ['npm test'],
            replyBody: 'Draft after fix.',
            canResolveAfterChecks: true,
            requiresHumanDecision: false,
          },
        ],
      },
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [repoView(), prView(), fixture('review-threads.graphql.json')]),
      sessionState: sessionWithPr(),
    })).rejects.toMatchObject({ code: 'invalid_triage_payload' });
  });

  it('moves needs_human triage to blocked with a human-decision next action', async () => {
    const result = await runFlowComments({
      pr: 123,
      triagePayload: {
        threads: [
          {
            threadId: 'PRRT_thread_1',
            classification: 'needs_human',
            confidence: 0.8,
            reason: 'Product decision.',
            recommendedAction: 'Ask maintainer.',
            filesToInspect: ['src/foo.ts'],
            filesToChange: [],
            checksToRun: [],
            replyBody: 'Maintainer decision needed.',
            canResolveAfterChecks: false,
            requiresHumanDecision: true,
          },
        ],
      },
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [repoView(), prView(), fixture('review-threads.graphql.json')]),
      sessionState: sessionWithPr(),
    });

    expect(result.lifecyclePhase).toBe('blocked');
    expect(result.nextExpectedActions.join('\n')).toContain('human decision');
  });

  it('returns clear no-comments state without claiming final_reported', async () => {
    const result = await runFlowComments({
      pr: 123,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [repoView(), prView(), fixture('review-threads-empty.graphql.json')]),
      sessionState: sessionWithPr(),
    });

    expect(result.status).toBe('none');
    expect(result.lifecyclePhase).toBe('verified');
    expect(result.summary).not.toContain('final_reported');
    expect(result.sessionState.reviewComments?.lastRun?.status).toBe('none');
  });

  it('returns a clear error when no PR can be determined', async () => {
    await expect(runFlowComments({
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient([], [
        repoView(),
        new GithubCliError({
          code: 'gh_command_failed',
          message: 'no pull requests found for branch',
          args: ['pr', 'view'],
          stderr: 'no pull requests found for branch',
        }),
      ]),
      sessionState: createCodeflowSessionState({ phase: 'pr_opened' }),
    })).rejects.toMatchObject({
      code: 'no_pr_found',
      message: expect.stringContaining('Run /flow-pr first or pass --pr <number>'),
    });
  });

  it('does not reply, resolve, commit, push, merge, approve, or delete branches', async () => {
    const calls: string[][] = [];
    await runFlowComments({
      pr: 123,
      config: getDefaultCodeflowConfig(),
      ghClient: ghClient(calls, [repoView(), prView(), fixture('review-threads.graphql.json')]),
      sessionState: sessionWithPr(),
    });

    const flatArgs = calls.flat();
    const flat = flatArgs.join(' ').toLowerCase();
    expect(flat).not.toContain('mutation');
    expect(flatArgs).not.toEqual(expect.arrayContaining(['reply', 'resolveReviewThread', 'commit', 'push', 'merge', 'approve', 'delete-branch']));
  });
});

describe('/flow-comments command registration', () => {
  it('registers the command and passes parsed flags with session state', async () => {
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
        runFlowComments: async (options = {}) => {
          receivedOptions = options;
          return {
            status: 'found',
            prNumber: options.pr as number,
            prUrl: 'https://github.com/org/repo/pull/123',
            threads: [],
            filteredThreads: [],
            triage: null,
            summary: 'Codeflow review comments found.',
            warnings: [],
            lifecyclePhase: 'review_triage',
            nextExpectedActions: ['Classify review threads.'],
            sessionState: createCodeflowSessionState({ phase: 'review_triage' }),
            incomplete: false,
            json: options.json === true,
          } satisfies FlowCommentsResult;
        },
      },
    );

    const result = await handlers.get('flow-comments')?.('--pr 123 --all --author coderabbitai --path src/foo.ts --include-outdated --triage-payload triage.json --json', {
      cwd: '/tmp/project',
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    }) as FlowCommentsResult;

    expect(result.lifecyclePhase).toBe('review_triage');
    expect(receivedOptions).toMatchObject({
      cwd: '/tmp/project',
      pr: 123,
      unresolvedOnly: false,
      includeResolved: true,
      authors: ['coderabbitai'],
      paths: ['src/foo.ts'],
      includeOutdated: true,
      triagePayloadPath: 'triage.json',
      json: true,
    });
    expect(notifications[0]?.message).toContain('Codeflow review comments found');
  });
});
