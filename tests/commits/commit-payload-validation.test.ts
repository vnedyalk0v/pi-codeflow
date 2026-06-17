import { describe, expect, it } from 'vitest';

import {
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  validateCommitPayload,
  type CodeflowCommitPayload,
} from '../../src/index';

function validPayload(overrides: Partial<CodeflowCommitPayload> = {}): CodeflowCommitPayload {
  return {
    type: 'feat',
    scope: 'commits',
    summary: 'add generated commit messages',
    context: 'Codeflow needs deterministic commit messages.',
    changes: ['Added commit payload validation.'],
    verification: ['npm test'],
    risk: 'Low. Unit-tested commit rendering change.',
    refs: ['#11'],
    ...overrides,
  };
}

function expectInvalid(payload: unknown, path: string): void {
  const result = validateCommitPayload(payload);

  expect(result.valid).toBe(false);
  if (!result.valid) {
    expect(result.errors.map((error) => error.path)).toContain(path);
  }
}

describe('validateCommitPayload', () => {
  it('accepts a valid payload', () => {
    const result = validateCommitPayload(validPayload());

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.refs).toEqual(['#11']);
      expect(result.warnings).toEqual([]);
    }
  });

  it('rejects missing type and invalid type', () => {
    const missingType = { ...validPayload() } as Record<string, unknown>;
    delete missingType.type;

    expectInvalid(missingType, '/type');
    expectInvalid(validPayload({ type: 'feature' as never }), '/type');
  });

  it('rejects missing summary, missing context, empty changes, and missing risk', () => {
    const missingSummary = { ...validPayload() } as Record<string, unknown>;
    const missingContext = { ...validPayload() } as Record<string, unknown>;
    const missingRisk = { ...validPayload() } as Record<string, unknown>;
    delete missingSummary.summary;
    delete missingContext.context;
    delete missingRisk.risk;

    expectInvalid(missingSummary, '/summary');
    expectInvalid(missingContext, '/context');
    expectInvalid(validPayload({ changes: [] }), '/changes');
    expectInvalid(missingRisk, '/risk');
  });

  it('rejects empty verification when required', () => {
    expectInvalid(validPayload({ verification: [] }), '/verification');
  });

  it('allows empty verification when config explicitly disables verification requirement', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      commits: {
        requireVerification: false,
      },
    } as Record<string, unknown>);
    const result = validateCommitPayload(validPayload({ verification: [] }), { config });

    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(
      'Commit payload does not include verification; config allows unverified commit payloads.',
    );
  });

  it('allows empty verification when explicitly allowing an unverified commit', () => {
    const result = validateCommitPayload(validPayload({ verification: [] }), {
      allowUnverified: true,
    });

    expect(result.valid).toBe(true);
  });

  it('allows missing risk when config explicitly disables risk requirement', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      commits: {
        requireRisk: false,
      },
    } as Record<string, unknown>);
    const input = { ...validPayload() } as Record<string, unknown>;
    delete input.risk;

    const result = validateCommitPayload(input, { config });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.risk).toBe('');
      expect(result.warnings).toContain(
        'Commit payload does not include risk; config allows risk to be omitted.',
      );
    }
  });

  it.each(['update', 'changes', 'fix stuff', 'misc', 'wip'])(
    'rejects generic summary %s',
    (summary) => {
      const result = validateCommitPayload(validPayload({ summary }));

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ keyword: 'genericSummary' })]),
        );
      }
    },
  );

  it('rejects trailing summary punctuation', () => {
    const result = validateCommitPayload(validPayload({ summary: 'add commit messages.' }));

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ keyword: 'trailingPunctuation' })]),
      );
    }
  });

  it('fails or warns for overlong rendered titles based on config', () => {
    const summary = 'add deterministic generated commit messages for structured payload rendering';
    const errorConfig = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      commits: { maxTitleLength: 24, titleLengthPolicy: 'error' },
    } as Record<string, unknown>);
    const warningConfig = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      commits: { maxTitleLength: 24, titleLengthPolicy: 'warning' },
    } as Record<string, unknown>);

    const errorResult = validateCommitPayload(validPayload({ summary }), { config: errorConfig });
    const warningResult = validateCommitPayload(validPayload({ summary }), { config: warningConfig });

    expect(errorResult.valid).toBe(false);
    if (!errorResult.valid) {
      expect(errorResult.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ keyword: 'maxTitleLength' })]),
      );
    }
    expect(warningResult.valid).toBe(true);
    if (warningResult.valid) {
      expect(warningResult.warnings.join('\n')).toContain('Rendered commit title');
    }
  });
});
