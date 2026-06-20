import { describe, expect, it } from 'vitest';

import type { CodeflowPrCheck, CodeflowPrCheckStatus } from '../../src/index';
import { getPrChecksAggregateStatus } from '../../src/github/pr-checks-policy';

function check(status: CodeflowPrCheckStatus): CodeflowPrCheck {
  return {
    name: status,
    workflow: null,
    status,
    rawState: status,
    bucket: 'unknown',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    description: null,
    detailsUrl: null,
    required: true,
  };
}

describe('GitHub PR checks policy', () => {
  it('classifies no checks without claiming pass', () => {
    expect(getPrChecksAggregateStatus([])).toBe('no_checks');
  });

  it('prioritizes failures over pending checks', () => {
    expect(getPrChecksAggregateStatus([check('pending'), check('failed')])).toBe('failed');
    expect(getPrChecksAggregateStatus([check('pending'), check('timed_out')])).toBe('failed');
    expect(getPrChecksAggregateStatus([check('pending'), check('cancelled')])).toBe('failed');
  });

  it('prioritizes unknown checks over pending checks', () => {
    expect(getPrChecksAggregateStatus([check('pending'), check('unknown')])).toBe('unknown');
  });

  it('classifies pending, skipped-only, passed, and unknown status sets', () => {
    expect(getPrChecksAggregateStatus([check('pending')])).toBe('pending');
    expect(getPrChecksAggregateStatus([check('skipped')])).toBe('skipped');
    expect(getPrChecksAggregateStatus([check('passed'), check('skipped')])).toBe('passed');
    expect(getPrChecksAggregateStatus([check('passed'), check('unknown')])).toBe('unknown');
  });
});
