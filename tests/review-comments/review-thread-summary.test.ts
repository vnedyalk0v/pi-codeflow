import { describe, expect, it } from 'vitest';

import {
  summarizeReviewThreads,
  validateReviewCommentTriage,
  type CodeflowReviewThread,
} from '../../src/index';

function thread(overrides: Partial<CodeflowReviewThread>): CodeflowReviewThread {
  const body = overrides.latestComment?.body ?? 'Potential null access in payment handler.';
  return {
    threadId: 'PRRT_thread_1',
    prNumber: 123,
    path: 'src/foo.ts',
    line: 42,
    startLine: null,
    isResolved: false,
    isOutdated: false,
    author: 'coderabbitai',
    authorAssociation: 'NONE',
    firstComment: null,
    comments: [],
    latestComment: {
      id: 'PRRC_comment_1',
      databaseId: null,
      author: 'coderabbitai',
      authorAssociation: 'NONE',
      body,
      path: 'src/foo.ts',
      line: 42,
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
    ...overrides,
  };
}

describe('summarizeReviewThreads', () => {
  it('summarizes no unresolved threads clearly without claiming final_reported', () => {
    const summary = summarizeReviewThreads({
      prNumber: 123,
      threads: [],
      filteredThreads: [],
      unresolvedOnly: true,
    });

    expect(summary).toContain('no unresolved review threads found');
    expect(summary).toContain('PR: #123');
    expect(summary).not.toContain('final_reported');
  });

  it('includes path, line, author, and truncated body summaries', () => {
    const summary = summarizeReviewThreads({
      prNumber: 123,
      threads: [thread({})],
      filteredThreads: [thread({ latestComment: { ...thread({}).latestComment!, body: 'x'.repeat(500) } })],
      unresolvedOnly: true,
    });

    expect(summary).toContain('src/foo.ts:42');
    expect(summary).toContain('coderabbitai');
    expect(summary).toContain('Summary:');
    expect(summary).not.toContain('x'.repeat(200));
  });

  it('summarizes triage classifications and human-decision blockers', () => {
    const triage = validateReviewCommentTriage({
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
        {
          threadId: 'PRRT_thread_2',
          classification: 'needs_human',
          confidence: 0.7,
          reason: 'Product decision.',
          recommendedAction: 'Ask maintainer.',
          filesToInspect: ['src/bar.ts'],
          filesToChange: [],
          checksToRun: [],
          replyBody: 'Maintainer decision needed.',
          canResolveAfterChecks: false,
          requiresHumanDecision: true,
        },
      ],
    });

    const summary = summarizeReviewThreads({
      prNumber: 123,
      threads: [thread({ threadId: 'PRRT_thread_1' }), thread({ threadId: 'PRRT_thread_2' })],
      filteredThreads: [thread({ threadId: 'PRRT_thread_1' }), thread({ threadId: 'PRRT_thread_2' })],
      triage,
    });

    expect(summary).toContain('valid: 1');
    expect(summary).toContain('needs_human: 1');
    expect(summary).toContain('require human decision');
  });
});
