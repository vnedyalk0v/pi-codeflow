import { describe, expect, it } from 'vitest';

import {
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  validatePrPayload,
  type CodeflowPrPayload,
} from '../../src/index';

function validPayload(overrides: Partial<CodeflowPrPayload> = {}): CodeflowPrPayload {
  return {
    title: {
      type: 'feat',
      scope: 'pull-requests',
      summary: 'implement generated pull requests',
    },
    body: {
      summary: 'Implemented /flow-pr.',
      context: 'Codeflow needs deterministic PR creation.',
      changes: ['Added PR payload validation.'],
      verification: ['npm test'],
      selfReview: ['Confirmed no merge automation was added.'],
      risk: 'Medium. This creates GitHub PRs.',
      rollback: 'Revert the PR.',
      refs: ['#12'],
    },
    ...overrides,
  };
}

function expectInvalid(payload: unknown, path: string): void {
  const result = validatePrPayload(payload);

  expect(result.valid).toBe(false);
  if (!result.valid) {
    expect(result.errors.map((error) => error.path)).toContain(path);
  }
}

describe('validatePrPayload', () => {
  it('accepts a valid structured payload', () => {
    const result = validatePrPayload(validPayload());

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.body.refs).toEqual(['#12']);
      expect(result.warnings).toEqual([]);
    }
  });

  it('rejects missing title and invalid title type', () => {
    const missingTitle = { ...validPayload() } as Record<string, unknown>;
    delete missingTitle.title;

    expectInvalid(missingTitle, '/title');
    expectInvalid(
      validPayload({ title: { ...validPayload().title, type: 'feature' as never } }),
      '/title/type',
    );
  });

  it('rejects missing body summary, empty changes, missing risk, and missing rollback', () => {
    const missingSummary = validPayload({ body: { ...validPayload().body, summary: '' } });
    const missingRisk = { ...validPayload(), body: { ...validPayload().body } } as Record<string, unknown>;
    const missingRollback = { ...validPayload(), body: { ...validPayload().body } } as Record<string, unknown>;
    delete (missingRisk.body as Record<string, unknown>).risk;
    delete (missingRollback.body as Record<string, unknown>).rollback;

    expectInvalid(missingSummary, '/body/summary');
    expectInvalid(validPayload({ body: { ...validPayload().body, changes: [] } }), '/body/changes');
    expectInvalid(missingRisk, '/body/risk');
    expectInvalid(missingRollback, '/body/rollback');
  });

  it('rejects empty verification and self-review when required', () => {
    expectInvalid(
      validPayload({ body: { ...validPayload().body, verification: [] } }),
      '/body/verification',
    );
    expectInvalid(
      validPayload({ body: { ...validPayload().body, selfReview: [] } }),
      '/body/selfReview',
    );
  });

  it('allows missing verification and self-review only when config explicitly allows them', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      pullRequest: {
        requireVerification: false,
        requireSelfReview: false,
      },
    } as Record<string, unknown>);
    const result = validatePrPayload(
      validPayload({ body: { ...validPayload().body, verification: [], selfReview: [] } }),
      { config },
    );

    expect(result.valid).toBe(true);
    expect(result.warnings.join('\n')).toContain('config allows unverified PR payloads');
    expect(result.warnings.join('\n')).toContain('config allows self-review to be omitted');
  });

  it('fails or warns for overlong rendered titles based on config', () => {
    const summary = 'add deterministic generated pull request titles and bodies for structured payload rendering';
    const errorConfig = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      pullRequest: { maxTitleLength: 24, titleLengthPolicy: 'error' },
    } as Record<string, unknown>);
    const warningConfig = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      pullRequest: { maxTitleLength: 24, titleLengthPolicy: 'warning' },
    } as Record<string, unknown>);

    const errorResult = validatePrPayload(validPayload({ title: { ...validPayload().title, summary } }), {
      config: errorConfig,
    });
    const warningResult = validatePrPayload(validPayload({ title: { ...validPayload().title, summary } }), {
      config: warningConfig,
    });

    expect(errorResult.valid).toBe(false);
    if (!errorResult.valid) {
      expect(errorResult.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ keyword: 'maxTitleLength' })]),
      );
    }
    expect(warningResult.valid).toBe(true);
    expect(warningResult.warnings.join('\n')).toContain('Rendered PR title');
  });

  it('rejects unknown fields when schema disallows them', () => {
    expectInvalid({ ...validPayload(), labels: ['feature'] }, '/labels');
  });
});
