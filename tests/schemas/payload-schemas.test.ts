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

  it('accepts review thread triage payloads', () => {
    const result = validateSchema('schemas/review-comment-triage.schema.json', {
      threads: [
        {
          threadId: 'PRRT_kwDOS83fzc4Example',
          classification: 'valid',
          confidence: 0.9,
          reason: 'The finding matches the current code.',
          recommendedAction: 'Fix the schema and add coverage.',
          filesToInspect: ['schemas/review-comment-triage.schema.json'],
          filesToChange: ['schemas/review-comment-triage.schema.json'],
          checksToRun: ['npm test'],
          replyBody: 'Draft after fix and checks: update the schema and add coverage.',
          canResolveAfterChecks: true,
          requiresHumanDecision: false,
        },
      ],
    });

    expect(result.valid).toBe(true);
  });

  it('rejects review triage requiring humans when resolution is allowed', () => {
    const result = validateSchema('schemas/review-comment-triage.schema.json', {
      threads: [
        {
          threadId: 'PRRT_kwDOS83fzc4InvalidHuman',
          classification: 'invalid',
          confidence: 0.7,
          reason: 'Default policy requires a human for invalid threads.',
          recommendedAction: 'Ask a maintainer before resolving.',
          filesToInspect: ['src/example.ts'],
          filesToChange: [],
          checksToRun: [],
          replyBody: 'Maintainer decision needed before resolution.',
          canResolveAfterChecks: true,
          requiresHumanDecision: true,
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: '/threads/0/canResolveAfterChecks',
          keyword: 'const',
        }),
      ]),
    );
  });

  it('rejects needs_human review triage that allows resolution', () => {
    const result = validateSchema('schemas/review-comment-triage.schema.json', {
      threads: [
        {
          threadId: 'PRRT_kwDOS83fzc4NeedsHuman',
          classification: 'needs_human',
          confidence: 0.7,
          reason: 'A product decision is required.',
          recommendedAction: 'Ask a maintainer for the expected behavior.',
          filesToInspect: ['src/example.ts'],
          filesToChange: [],
          checksToRun: [],
          replyBody: 'Maintainer decision needed before changing behavior.',
          canResolveAfterChecks: true,
          requiresHumanDecision: true,
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: '/threads/0/canResolveAfterChecks',
          keyword: 'const',
        }),
      ]),
    );
  });
});
