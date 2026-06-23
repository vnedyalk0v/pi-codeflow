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
    const config = mergeCodeflowConfig(
      getDefaultCodeflowConfig(),
      readJson(relativePath) as Record<string, unknown>,
    );
    const result = validateCodeflowConfig(config);

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

  it('rejects malformed configured base branches', () => {
    const config = cloneDefault();
    config.baseBranches.allowed = ['dev', 'refs/heads/main'];
    config.pullRequest.baseBranch = 'dev';
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/baseBranches/allowed/1',
            keyword: 'pattern',
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

  it('rejects a default branch type outside allowed branch types', () => {
    const config = cloneDefault();
    config.branching.allowedTypes = ['docs'];
    config.branching.defaultType = 'feat';
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/branching/defaultType',
            keyword: 'allowedBranchType',
            allowedValues: ['docs'],
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

  it('rejects invalid auto-resolution when invalid comments require humans', () => {
    const config = cloneDefault();
    config.reviewComments.autoResolve = true;
    config.reviewComments.requireHumanForInvalid = true;
    config.reviewComments.autoResolveClassifications = [
      'stale',
      'already_fixed',
      'invalid',
    ];
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/reviewComments/autoResolveClassifications',
            keyword: 'not',
          }),
        ]),
      );
    }
  });

  it.each([
    {
      name: 'pull request watch interval above 300 seconds',
      update(config: ReturnType<typeof cloneDefault>) {
        config.pullRequest.checksWatchIntervalSeconds = 301;
      },
      path: '/pullRequest/checksWatchIntervalSeconds',
    },
    {
      name: 'pull request watch timeout above 3600 seconds',
      update(config: ReturnType<typeof cloneDefault>) {
        config.pullRequest.checksWatchTimeoutSeconds = 3601;
      },
      path: '/pullRequest/checksWatchTimeoutSeconds',
    },
    {
      name: 'check timeoutMs above 3600000',
      update(config: ReturnType<typeof cloneDefault>) {
        config.checks = [{ name: 'slow', command: 'npm test', timeoutMs: 3_600_001 }];
      },
      path: '/checks/0/timeoutMs',
    },
    {
      name: 'unsupported check timeoutSeconds',
      update(config: ReturnType<typeof cloneDefault>) {
        config.checks = [{ name: 'slow', command: 'npm test', timeoutSeconds: 30 } as never];
      },
      path: '/checks/0/timeoutSeconds',
      keyword: 'additionalProperties',
    },
  ])('rejects $name', ({ update, path, keyword = 'maximum' }) => {
    const config = cloneDefault();
    update(config);
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path,
            keyword,
          }),
        ]),
      );
    }
  });

  it('rejects unsupported config inheritance', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      extends: './base.codeflow.json',
    } as Record<string, unknown>);
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/extends',
            keyword: 'additionalProperties',
          }),
        ]),
      );
    }
  });

  it('rejects unimplemented branch collision modes', () => {
    const config = cloneDefault();
    config.branching.slug.collisionSuffix = 'short-sha' as never;
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/branching/slug/collisionSuffix',
            keyword: 'enum',
          }),
        ]),
      );
    }
  });

  it('rejects no-op safety flags', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      safety: {
        allowForcePush: false,
      },
    } as Record<string, unknown>);
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/safety/allowForcePush',
            keyword: 'additionalProperties',
          }),
        ]),
      );
    }
  });

  it.each([
    ['commits.conventional', { commits: { conventional: true } }, '/commits/conventional'],
    [
      'commits.requireStructuredPayload',
      { commits: { requireStructuredPayload: true } },
      '/commits/requireStructuredPayload',
    ],
    [
      'reviewComments.provider',
      { reviewComments: { provider: 'github-graphql' } },
      '/reviewComments/provider',
    ],
    [
      'reviewComments.requireHumanForNeedsHuman',
      { reviewComments: { requireHumanForNeedsHuman: true } },
      '/reviewComments/requireHumanForNeedsHuman',
    ],
    ['emergency.requireReason', { emergency: { requireReason: true } }, '/emergency/requireReason'],
    [
      'emergency.documentBackportToDev',
      { emergency: { documentBackportToDev: true } },
      '/emergency/documentBackportToDev',
    ],
    ['guidance.trackedPhases', { guidance: { trackedPhases: ['idle'] } }, '/guidance/trackedPhases'],
  ])('rejects removed no-op config flag %s', (_name, projectConfig, path) => {
    const config = mergeCodeflowConfig(
      getDefaultCodeflowConfig(),
      projectConfig as Record<string, unknown>,
    );
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path,
            keyword: 'additionalProperties',
          }),
        ]),
      );
    }
  });
});
