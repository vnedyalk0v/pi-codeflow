import { describe, expect, it } from 'vitest';

import { summarizeReviewFix } from '../../src/review-comments/review-fix-summary';

describe('summarizeReviewFix', () => {
  it('summarizes dry-run planned actions and blockers', () => {
    const summary = summarizeReviewFix({
      status: 'dry_run',
      prNumber: 123,
      replies: [
        { threadId: 'PRRT_1', classification: 'valid', status: 'planned', commentId: null, url: null, body: 'reply' },
      ],
      resolutions: [
        { threadId: 'PRRT_1', classification: 'valid', status: 'planned', resolved: false },
      ],
      blocked: [
        { threadId: 'PRRT_2', classification: 'needs_human', reason: 'human decision required' },
      ],
      requiresHumanDecision: ['PRRT_2'],
      warnings: [],
      dryRun: true,
      applyReplies: false,
      applyResolutions: false,
    });

    expect(summary).toContain('dry-run');
    expect(summary).toContain('replies planned: 1');
    expect(summary).toContain('resolutions planned: 1');
    expect(summary).toContain('human decisions required: 1');
    expect(summary).toContain('PRRT_2');
  });

  it('summarizes applied replies and resolutions', () => {
    const summary = summarizeReviewFix({
      status: 'applied',
      prNumber: 123,
      replies: [
        { threadId: 'PRRT_1', classification: 'valid', status: 'posted', commentId: 'PRRC_1', url: 'https://example.test', body: null },
      ],
      resolutions: [
        { threadId: 'PRRT_1', classification: 'valid', status: 'resolved', resolved: true },
      ],
      blocked: [],
      requiresHumanDecision: [],
      warnings: ['remote verification was pending'],
      dryRun: false,
      applyReplies: true,
      applyResolutions: true,
    });

    expect(summary).toContain('replies posted: 1');
    expect(summary).toContain('threads resolved: 1');
    expect(summary).toContain('Warnings:');
  });
});
