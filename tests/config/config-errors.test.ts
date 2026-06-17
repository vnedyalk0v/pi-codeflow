import { describe, expect, it } from 'vitest';

import {
  CodeflowConfigLoadError,
  getDefaultCodeflowConfig,
  validateCodeflowConfig,
} from '../../src/index';

describe('config errors', () => {
  it('creates stable load errors', () => {
    const error = new CodeflowConfigLoadError({
      code: 'file_not_found',
      path: '/tmp/missing-codeflow.json',
      message: 'Codeflow config file was not found: /tmp/missing-codeflow.json',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CodeflowConfigLoadError');
    expect(error.code).toBe('file_not_found');
    expect(error.path).toBe('/tmp/missing-codeflow.json');
    expect(error.message).toContain('not found');
  });

  it('maps enum validation errors to stable objects with allowed values', () => {
    const config = getDefaultCodeflowConfig();
    config.emergency.defaultPath = 'direct_main' as never;
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/emergency/defaultPath',
            keyword: 'enum',
            message: expect.any(String),
            allowedValues: ['hotfix_branch', 'human_only'],
          }),
        ]),
      );
    }
  });

  it('maps conditional validation errors to stable paths', () => {
    const config = getDefaultCodeflowConfig();
    config.baseBranches.missingDefaultBehavior = 'fallback';
    delete (config.baseBranches as unknown as Record<string, unknown>).fallback;
    const result = validateCodeflowConfig(config);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((error) => error.path)).toContain('/baseBranches/fallback');
      expect(result.errors.every((error) => 'keyword' in error)).toBe(true);
    }
  });
});
