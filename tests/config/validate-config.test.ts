import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  validateCodeflowConfig,
} from '../../src/index';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function readJson(relativePath: string): unknown {
  const text = readFileSync(path.join(repoRoot, relativePath), 'utf8');
  return JSON.parse(text) as unknown;
}

function cloneDefault(): ReturnType<typeof getDefaultCodeflowConfig> {
  return JSON.parse(JSON.stringify(getDefaultCodeflowConfig())) as ReturnType<
    typeof getDefaultCodeflowConfig
  >;
}

describe('validateCodeflowConfig', () => {
  it.each([
    'config/example.node.codeflow.json',
    'config/example.python.codeflow.json',
    'config/example.monorepo.codeflow.json',
  ])('validates %s', (relativePath) => {
    const result = validateCodeflowConfig(readJson(relativePath));

    expect(result.valid).toBe(true);
  });

  it('rejects an unknown top-level key', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      extraPolicy: true,
    } as Record<string, unknown>);
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/extraPolicy',
            keyword: 'additionalProperties',
          }),
        ]),
      );
    }
  });

  it('rejects an invalid branch type', () => {
    const config = cloneDefault();
    config.branching.defaultType = 'feature' as never;
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/branching/defaultType',
            keyword: 'enum',
            allowedValues: expect.arrayContaining(['feat', 'fix', 'chore']),
          }),
        ]),
      );
    }
  });

  it('rejects a missing required baseBranches.default value', () => {
    const config = cloneDefault();
    delete (config.baseBranches as unknown as Record<string, unknown>).default;
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/baseBranches/default',
            keyword: 'required',
          }),
        ]),
      );
    }
  });

  it('requires baseBranches.fallback when missingDefaultBehavior is fallback', () => {
    const config = cloneDefault();
    config.baseBranches.missingDefaultBehavior = 'fallback';
    delete (config.baseBranches as unknown as Record<string, unknown>).fallback;
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/baseBranches/fallback',
            keyword: 'required',
          }),
        ]),
      );
    }
  });

  it('rejects a pull request base branch outside allowed base branches', () => {
    const config = cloneDefault();
    config.baseBranches.allowed = ['dev'];
    config.pullRequest.baseBranch = 'production';
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/pullRequest/baseBranch',
            keyword: 'allowedBaseBranch',
            allowedValues: ['dev'],
          }),
        ]),
      );
    }
  });

  it('rejects null used to remove a required object', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      baseBranches: null,
    } as Record<string, unknown>);
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/baseBranches',
            keyword: 'type',
          }),
        ]),
      );
    }
  });

  it('returns a warning when a schema-valid config contains extends', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      extends: './base.codeflow.json',
    } as Record<string, unknown>);
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warnings).toEqual([
        expect.stringContaining('extends field is reserved'),
      ]);
    }
  });
});
