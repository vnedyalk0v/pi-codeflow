import { describe, expect, it } from 'vitest';

import {
  getDefaultCodeflowConfig,
  isReservedBranch,
  mergeCodeflowConfig,
} from '../../src/index';

describe('reserved branch policy', () => {
  it.each(['main', 'dev', 'stage'])('reserves %s by default', (branch) => {
    expect(isReservedBranch(branch, getDefaultCodeflowConfig())).toBe(true);
  });

  it('respects custom reserved branches', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      reservedBranches: ['trunk'],
    } as Record<string, unknown>);

    expect(isReservedBranch('trunk', config)).toBe(true);
  });

  it('does not reserve semantic work branches', () => {
    expect(isReservedBranch('feat/flow-start-semantic-branch', getDefaultCodeflowConfig())).toBe(
      false,
    );
  });
});
