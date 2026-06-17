import { describe, expect, it } from 'vitest';

import {
  BranchPolicyError,
  getDefaultCodeflowConfig,
  inferBranchType,
} from '../../src/index';

describe('inferBranchType', () => {
  it('honors explicit branch type', () => {
    const config = getDefaultCodeflowConfig();

    expect(inferBranchType({ task: 'Fix checkout timeout', config, type: 'docs' })).toBe(
      'docs',
    );
  });

  it('fails for invalid explicit branch type', () => {
    const config = getDefaultCodeflowConfig();

    expect(() =>
      inferBranchType({ task: 'Add login', config, type: 'feature' }),
    ).toThrow(BranchPolicyError);
  });

  it.each([
    ['Fix checkout timeout', 'fix'],
    ['Document config loader', 'docs'],
    ['Refactor guidance formatting', 'refactor'],
    ['Add Google OAuth login', 'feat'],
    ['Emergency checkout is down', 'hotfix'],
  ] as const)('infers %s -> %s', (task, expectedType) => {
    const config = getDefaultCodeflowConfig();

    expect(inferBranchType({ task, config })).toBe(expectedType);
  });
});
