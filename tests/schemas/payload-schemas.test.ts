import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020, { type AnySchema } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function validateSchema(relativePath: string, input: unknown) {
  const schema = JSON.parse(
    readFileSync(path.join(repoRoot, relativePath), 'utf8'),
  ) as AnySchema;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const valid = validate(input);

  return {
    valid,
    errors: validate.errors ?? [],
  };
}

describe('payload schemas', () => {
  it('accepts the structured nested PR payload shape', () => {
    const result = validateSchema('schemas/pr-payload.schema.json', {
      title: {
        type: 'feat',
        scope: 'pull-requests',
        summary: 'implement generated pull requests',
        ticket: 'FLOW-12',
      },
      body: {
        summary: 'Implemented /flow-pr.',
        context: 'Codeflow needs deterministic PR formatting.',
        changes: ['Added PR payload validation.'],
        verification: ['npm test'],
        selfReview: ['Confirmed no merge automation was added.'],
        risk: 'Medium.',
        rollback: 'Revert the PR.',
        reviewerNotes: 'Focus on PR safety.',
        refs: ['#12'],
      },
      draft: true,
      baseBranch: 'dev',
      headBranch: 'feat/flow-pr-generated-title-body',
    });

    expect(result.valid).toBe(true);
  });

  it('rejects malformed PR branch overrides', () => {
    const result = validateSchema('schemas/pr-payload.schema.json', {
      title: {
        type: 'feat',
        summary: 'implement generated pull requests',
      },
      body: {
        summary: 'Implemented /flow-pr.',
        context: 'Codeflow needs deterministic PR formatting.',
        changes: ['Added PR payload validation.'],
        risk: 'Medium.',
        rollback: 'Revert the PR.',
      },
      baseBranch: 'dev',
      headBranch: 'refs/heads/main',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: '/headBranch',
          keyword: 'pattern',
        }),
      ]),
    );
  });

  it('rejects unknown PR payload fields', () => {
    const result = validateSchema('schemas/pr-payload.schema.json', {
      title: {
        type: 'feat',
        summary: 'implement generated pull requests',
      },
      body: {
        summary: 'Implemented /flow-pr.',
        context: 'Codeflow needs deterministic PR formatting.',
        changes: ['Added PR payload validation.'],
        risk: 'Medium.',
        rollback: 'Revert the PR.',
      },
      labels: ['feature'],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: '',
          keyword: 'additionalProperties',
        }),
      ]),
    );
  });

  it('rejects empty emergency audit fields when emergency override is used', () => {
    const result = validateSchema('schemas/final-report.schema.json', {
      summary: 'Emergency fix shipped.',
      finalPhase: 'emergency',
      changedFiles: ['src/example.ts'],
      checks: [
        {
          name: 'tests',
          result: 'passed',
        },
      ],
      issues: ['#123'],
      risks: ['Backport still required.'],
      emergencyOverride: {
        used: true,
        reason: '',
        backportPlan: '',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: '/emergencyOverride/reason',
          keyword: 'minLength',
        }),
        expect.objectContaining({
          instancePath: '/emergencyOverride/backportPlan',
          keyword: 'minLength',
        }),
      ]),
    );
  });

  it('accepts review triage comments identified only by URL', () => {
    const result = validateSchema('schemas/review-comment-triage.schema.json', {
      comments: [
        {
          url: 'https://github.com/vnedyalk0v/pi-codeflow/pull/20#discussion_r1',
          classification: 'valid',
          rationale: 'The finding matches the documented behavior.',
          action: 'Fix the schema.',
          mayResolveAfterVerification: true,
        },
      ],
    });

    expect(result.valid).toBe(true);
  });

  it('rejects review triage comments without id or URL', () => {
    const result = validateSchema('schemas/review-comment-triage.schema.json', {
      comments: [
        {
          classification: 'valid',
          rationale: 'Missing identifier.',
          action: 'Add an id or URL.',
          mayResolveAfterVerification: false,
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: '/comments/0',
          keyword: 'anyOf',
        }),
      ]),
    );
  });
});
