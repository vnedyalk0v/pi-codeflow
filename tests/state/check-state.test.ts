import { describe, expect, it } from 'vitest';

import type { CodeflowCheckRunResult } from '../../src/index';
import {
  createInitialCheckState,
  updateCheckStateWithRun,
} from '../../src/state/check-state';

function makeRun(status: CodeflowCheckRunResult['status']): CodeflowCheckRunResult {
  return {
    status,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1000,
    results: [
      {
        name: 'test',
        command: 'npm test',
        status: status === 'failed' ? 'failed' : 'passed',
        exitCode: status === 'failed' ? 1 : 0,
        signal: null,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
        durationMs: 1000,
        stdout: 'large stdout should not persist',
        stderr: 'large stderr should not persist',
        summary: 'x'.repeat(1000),
        required: true,
      },
    ],
    summary: 'run summary',
    failedCheckNames: status === 'failed' ? ['test'] : [],
    passedCheckNames: status === 'failed' ? [] : ['test'],
    skippedCheckNames: [],
  };
}

describe('Codeflow check state', () => {
  it('stores the latest passed check run in bounded state', () => {
    const state = updateCheckStateWithRun(createInitialCheckState(), makeRun('passed'));

    expect(state.lastRun).toMatchObject({
      status: 'passed',
      results: [
        {
          name: 'test',
          command: 'npm test',
          status: 'passed',
          exitCode: 0,
          durationMs: 1000,
        },
      ],
    });
    expect(state.lastRun?.results[0]?.summary.length).toBeLessThanOrEqual(500);
    expect(JSON.stringify(state)).not.toContain('large stdout should not persist');
  });

  it('stores the latest failed check run', () => {
    const state = updateCheckStateWithRun(createInitialCheckState(), makeRun('failed'));

    expect(state.lastRun?.status).toBe('failed');
    expect(state.lastRun?.results[0]).toMatchObject({ status: 'failed', exitCode: 1 });
  });

  it('stores a no-checks run without claiming verification', () => {
    const state = updateCheckStateWithRun(createInitialCheckState(), {
      status: 'no_checks',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:00.000Z',
      durationMs: 0,
      results: [],
      summary: 'No checks are configured.',
      failedCheckNames: [],
      passedCheckNames: [],
      skippedCheckNames: [],
    });

    expect(state.lastRun).toEqual({
      status: 'no_checks',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:00.000Z',
      durationMs: 0,
      results: [],
    });
  });
});
