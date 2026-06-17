import { describe, expect, it } from 'vitest';

import {
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  validateCodeflowConfig,
} from '../../src/index';

describe('mergeCodeflowConfig', () => {
  it('replaces arrays from the project config', () => {
    const defaults = getDefaultCodeflowConfig();
    const merged = mergeCodeflowConfig(defaults, {
      reservedBranches: ['main'],
      checks: [
        {
          name: 'test',
          command: 'npm test',
        },
      ],
    });

    expect(merged.reservedBranches).toEqual(['main']);
    expect(merged.checks).toEqual([{ name: 'test', command: 'npm test' }]);
  });

  it('recursively merges nested objects', () => {
    const defaults = getDefaultCodeflowConfig();
    const merged = mergeCodeflowConfig(defaults, {
      branching: {
        slug: {
          maxLength: 32,
        },
      },
      templates: {
        pullRequest: 'custom/pull-request.md',
      },
    } as Record<string, unknown>);

    expect(merged.branching.slug.maxLength).toBe(32);
    expect(merged.branching.slug.case).toBe('kebab');
    expect(merged.branching.slug.collisionSuffix).toBe('increment');
    expect(merged.templates.pullRequest).toBe('custom/pull-request.md');
    expect(merged.templates.commitMessage).toBe('templates/commit-message.md');
  });

  it('replaces scalar values from the project config', () => {
    const defaults = getDefaultCodeflowConfig();
    const merged = mergeCodeflowConfig(defaults, {
      pullRequest: {
        draftByDefault: false,
      },
      safety: {
        requireCleanWorkingTreeForStart: false,
      },
    } as Record<string, unknown>);

    expect(merged.pullRequest.draftByDefault).toBe(false);
    expect(merged.pullRequest.baseBranch).toBe('dev');
    expect(merged.safety.requireCleanWorkingTreeForStart).toBe(false);
    expect(merged.safety.allowForcePush).toBe(false);
  });

  it('keeps unknown properties so validation can reject them', () => {
    const defaults = getDefaultCodeflowConfig();
    const merged = mergeCodeflowConfig(defaults, {
      unknownTopLevelKey: true,
    } as Record<string, unknown>);
    const validation = validateCodeflowConfig(merged);

    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/unknownTopLevelKey',
            keyword: 'additionalProperties',
          }),
        ]),
      );
    }
  });

  it('defines __proto__ as an own property so validation can reject it', () => {
    const defaults = getDefaultCodeflowConfig();
    const projectConfig = JSON.parse(
      '{"__proto__":{"polluted":true},"branching":{"slug":{"__proto__":{"nestedPolluted":true}}}}',
    ) as Record<string, unknown>;
    const merged = mergeCodeflowConfig(defaults, projectConfig);

    expect(Object.hasOwn(merged, '__proto__')).toBe(true);
    expect(Object.hasOwn(merged.branching.slug, '__proto__')).toBe(true);
    expect((merged as unknown as Record<string, unknown>).polluted).toBeUndefined();
    expect(
      (merged.branching.slug as unknown as Record<string, unknown>).nestedPolluted,
    ).toBeUndefined();

    const validation = validateCodeflowConfig(merged);

    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/__proto__',
            keyword: 'additionalProperties',
          }),
          expect.objectContaining({
            path: '/branching/slug/__proto__',
            keyword: 'additionalProperties',
          }),
        ]),
      );
    }
  });
});
