import { describe, expect, it } from 'vitest';

import {
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  renderPrTitle,
  validatePrPayload,
  type CodeflowPrPayload,
} from '../../src/index';

function payload(summary = 'add default config validation'): CodeflowPrPayload {
  return {
    title: {
      type: 'feat',
      scope: 'config',
      summary,
    },
    body: {
      summary: 'Add config validation.',
      context: 'Config must be validated before use.',
      changes: ['Added validation.'],
      verification: ['npm test'],
      selfReview: ['Checked renderer output.'],
      risk: 'Low.',
      rollback: 'Revert the PR.',
    },
  };
}

describe('renderPrTitle', () => {
  it('renders title with scope', () => {
    expect(renderPrTitle(payload().title)).toBe('feat(config): add default config validation');
  });

  it('renders title without scope', () => {
    expect(renderPrTitle({ type: 'docs', summary: 'update configuration guide' })).toBe(
      'docs: update configuration guide',
    );
  });

  it('renders title with ticket when configured template includes tickets', () => {
    expect(
      renderPrTitle({
        type: 'feat',
        scope: 'billing',
        summary: 'add stripe webhook verification',
        ticket: 'BILL-142',
      }),
    ).toBe('[BILL-142] feat(billing): add stripe webhook verification');
  });

  it('does not include tickets when configured template omits the ticket placeholder', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      pullRequest: { titleTemplate: '{{type}}{{scopeSuffix}}: {{summary}}' },
    } as Record<string, unknown>);

    expect(
      renderPrTitle(
        {
          type: 'feat',
          scope: 'billing',
          summary: 'add stripe webhook verification',
          ticket: 'BILL-142',
        },
        config,
      ),
    ).toBe('feat(billing): add stripe webhook verification');
  });

  it('validates title length based on config', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      pullRequest: { maxTitleLength: 12, titleLengthPolicy: 'error' },
    } as Record<string, unknown>);
    const result = validatePrPayload(payload('add a very long deterministic title'), { config });

    expect(result.valid).toBe(false);
  });

  it('does not leave unresolved placeholders in the default title', () => {
    expect(renderPrTitle(payload().title)).not.toMatch(/{{.*}}/);
  });
});
