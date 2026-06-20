import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { normalizeReviewThreads } from '../../src/index';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(repoRoot, 'tests/fixtures/github', name), 'utf8')) as unknown;
}

describe('normalizeReviewThreads', () => {
  it('normalizes thread and comment fields while preserving separate IDs', () => {
    const threads = normalizeReviewThreads(fixture('review-threads.graphql.json'));

    expect(threads).toHaveLength(2);
    expect(threads[0]).toMatchObject({
      threadId: 'PRRT_thread_1',
      prNumber: 123,
      path: 'src/foo.ts',
      line: 42,
      startLine: null,
      isResolved: false,
      isOutdated: false,
      author: 'coderabbitai',
      authorAssociation: 'NONE',
      source: 'github-graphql',
      canResolve: true,
      canReply: true,
    });
    expect(threads[0]?.firstComment?.id).toBe('PRRC_comment_1');
    expect(threads[0]?.threadId).not.toBe(threads[0]?.firstComment?.id);
    expect(threads[0]?.firstComment?.databaseId).toBe(1001);
    expect(threads[0]?.latestComment?.body).toContain('Potential null access');
  });

  it('chooses first and latest comments and handles missing optional fields', () => {
    const threads = normalizeReviewThreads([
      {
        id: 'PRRT_missing_optional',
        isResolved: false,
        comments: {
          nodes: [
            { id: 'PRRC_first', body: 'First', author: null },
            { id: 'PRRC_latest', body: 'Latest', path: 'src/latest.ts', line: 9 },
          ],
        },
      },
    ], { prNumber: 456 });

    expect(threads[0]?.path).toBe('src/latest.ts');
    expect(threads[0]?.line).toBe(9);
    expect(threads[0]?.firstComment?.id).toBe('PRRC_first');
    expect(threads[0]?.latestComment?.id).toBe('PRRC_latest');
    expect(threads[0]?.author).toBeNull();
    expect(threads[0]?.url).toBeNull();
  });
});
