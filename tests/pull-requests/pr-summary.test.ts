import { describe, expect, it } from 'vitest';

import type { CodeflowPrPayload } from '../../src/index';
import { getPrRefs, summarizePrPayload } from '../../src/pull-requests/pr-summary';

function payload(): CodeflowPrPayload {
  return {
    title: {
      type: 'feat',
      summary: 'summarize PR payloads',
    },
    body: {
      summary: 'Summarizes PR payloads without storing large bodies.',
      context: 'State should stay bounded.',
      changes: ['Added summary helpers.'],
      verification: ['npm test'],
      selfReview: ['Checked no large body storage.'],
      risk: 'Low.',
      rollback: 'Revert.',
      refs: ['#12'],
    },
  };
}

describe('PR summary helpers', () => {
  it('returns refs and summary from structured payloads', () => {
    expect(getPrRefs(payload())).toEqual(['#12']);
    expect(summarizePrPayload(payload())).toBe('Summarizes PR payloads without storing large bodies.');
  });
});
