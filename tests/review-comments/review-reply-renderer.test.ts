import { describe, expect, it } from 'vitest';

import { renderReviewReply, type CodeflowReviewFixItem } from '../../src/index';

const templateText = '{{replyBody}}\n\nVerification summary:\n{{verificationList}}\n\nResolution note: {{resolution}}';

function item(overrides: Partial<CodeflowReviewFixItem> = {}): CodeflowReviewFixItem {
  return {
    threadId: 'PRRT_thread_1',
    classification: 'valid',
    fixSummary: 'Updated validation and added coverage.',
    verification: ['npm test passed'],
    checksRun: ['npm test'],
    commitSha: 'abc1234',
    resolveRequested: true,
    ...overrides,
  };
}

describe('renderReviewReply', () => {
  it('renders valid fixed replies with commit SHA and verification', async () => {
    const result = await renderReviewReply(item(), { templateText });

    expect(result.body).toContain('Addressed in `abc1234`');
    expect(result.body).toContain('Updated validation and added coverage.');
    expect(result.body).toContain('npm test passed');
    expect(result.body).toContain('Resolution has been requested');
    expect(result.body).not.toMatch(/{{[^}]+}}/);
  });

  it('renders already_fixed and stale replies with evidence', async () => {
    const alreadyFixed = await renderReviewReply(item({
      classification: 'already_fixed',
      commitSha: undefined,
      fixSummary: 'The current code already returns null safely.',
    }), { templateText });
    const stale = await renderReviewReply(item({
      classification: 'stale',
      commitSha: undefined,
      fixSummary: 'The reviewed diff hunk was removed.',
    }), { templateText });

    expect(alreadyFixed.body).toContain('already addressed');
    expect(alreadyFixed.body).toContain('Resolution has been requested');
    expect(stale.body).toContain('thread is stale');
    expect(stale.body).toContain('Resolution has been requested');
  });

  it('renders invalid explanatory replies without default resolution', async () => {
    const result = await renderReviewReply(item({
      classification: 'invalid',
      commitSha: undefined,
      fixSummary: 'The suggested path is not used by this code path.',
      resolveRequested: false,
    }), { templateText });

    expect(result.body).toContain('does not apply');
    expect(result.body).toContain('not resolving this thread automatically');
  });

  it('does not render a resolving reply for needs_human', async () => {
    const result = await renderReviewReply(item({
      classification: 'needs_human',
      commitSha: undefined,
      fixSummary: undefined,
      humanDecision: 'Maintainer must choose the API behavior.',
      resolveRequested: false,
    }), { templateText });

    expect(result.body).toContain('human decision');
    expect(result.body).toContain('No automatic resolution');
    expect(result.body).not.toContain('I am resolving this thread');
  });

  it('keeps replies concise and redacts secrets', async () => {
    const result = await renderReviewReply(item({
      fixSummary: `Used token=ghp_${'a'.repeat(30)} while testing.`,
      verification: ['npm test passed'],
    }), { templateText });

    expect(result.body.length).toBeLessThan(4000);
    expect(result.body).not.toContain('ghp_');
    expect(result.body).toContain('[REDACTED]');
  });
});
