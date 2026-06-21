import { describe, expect, it } from 'vitest';

import { filterReviewThreads, type CodeflowReviewThread } from '../../src/index';

function thread(overrides: Partial<CodeflowReviewThread>): CodeflowReviewThread {
  return {
    threadId: 'PRRT_default',
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
    ...overrides,
  };
}

describe('filterReviewThreads', () => {
  const threads = [
    thread({ threadId: 'unresolved', path: 'src/foo.ts', author: 'alice' }),
    thread({ threadId: 'resolved', isResolved: true, path: 'src/foo.ts', author: 'alice' }),
    thread({ threadId: 'outdated', isOutdated: true, path: 'src/old.ts', author: 'codex' }),
    thread({ threadId: 'bar', path: 'src/bar.ts', author: 'coderabbitai' }),
  ];

  it('filters resolved threads by default and includes all with includeResolved', () => {
    expect(filterReviewThreads(threads).map((item) => item.threadId)).toEqual(['unresolved', 'bar']);
    expect(filterReviewThreads(threads, { includeResolved: true }).map((item) => item.threadId)).toEqual([
      'unresolved',
      'resolved',
      'bar',
    ]);
  });

  it('controls outdated threads', () => {
    expect(filterReviewThreads(threads, { includeOutdated: false }).map((item) => item.threadId)).not.toContain('outdated');
    expect(filterReviewThreads(threads, { includeOutdated: true }).map((item) => item.threadId)).toContain('outdated');
  });

  it('applies author and path filters', () => {
    expect(filterReviewThreads(threads, { authors: ['coderabbitai'] }).map((item) => item.threadId)).toEqual(['bar']);
    expect(filterReviewThreads(threads, { paths: ['src/foo.ts'] }).map((item) => item.threadId)).toEqual(['unresolved']);
  });

  it('enforces maxThreads after filtering', () => {
    expect(filterReviewThreads(threads, { includeResolved: true, maxThreads: 2 }).map((item) => item.threadId)).toEqual([
      'unresolved',
      'resolved',
    ]);
  });
});
