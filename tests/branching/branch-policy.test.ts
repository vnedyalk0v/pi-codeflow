import { describe, expect, it } from 'vitest';

import {
  BranchPolicyError,
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  validateBranchType,
} from '../../src/index';

describe('branch policy', () => {
  it('accepts configured branch types', () => {
    const config = getDefaultCodeflowConfig();

    expect(validateBranchType('feat', config)).toBe('feat');
  });

  it('rejects branch types outside config.branching.allowedTypes', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      branching: { allowedTypes: ['docs'] },
    } as Record<string, unknown>);

    expect(() => validateBranchType('feat', config)).toThrow(BranchPolicyError);
  });
});
