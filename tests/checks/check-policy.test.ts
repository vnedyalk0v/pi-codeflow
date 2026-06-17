import { describe, expect, it } from 'vitest';

import type { CodeflowCheckResult } from '../../src/index';
import {
  getCheckNamesByStatus,
  getCheckRunStatus,
  shouldStopAfterCheckResult,
} from '../../src/checks/check-policy';

function makeResult(
  name: string,
  status: CodeflowCheckResult['status'],
  required = true,
): CodeflowCheckResult {
  return {
    name,
    command: `echo ${name}`,
    status,
    exitCode: status === 'passed' ? 0 : status === 'skipped' ? null : 1,
    signal: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1000,
    stdout: '',
    stderr: '',
    summary: `${name} ${status}`,
    required,
  };
}

describe('check policy', () => {
  it('classifies no checks, all skipped checks, required failures, and passes', () => {
    expect(getCheckRunStatus([])).toBe('no_checks');
    expect(getCheckRunStatus([makeResult('lint', 'skipped')])).toBe('skipped');
    expect(getCheckRunStatus([makeResult('test', 'failed')])).toBe('failed');
    expect(getCheckRunStatus([makeResult('audit', 'failed', false)])).toBe('passed');
    expect(getCheckRunStatus([makeResult('lint', 'passed')])).toBe('passed');
  });

  it('stops only after required failures when requested', () => {
    expect(shouldStopAfterCheckResult(makeResult('test', 'failed'), true)).toBe(true);
    expect(shouldStopAfterCheckResult(makeResult('slow', 'timed_out'), true)).toBe(true);
    expect(shouldStopAfterCheckResult(makeResult('audit', 'failed', false), true)).toBe(false);
    expect(shouldStopAfterCheckResult(makeResult('test', 'failed'), false)).toBe(false);
  });

  it('collects passed, failed, and skipped check names', () => {
    expect(
      getCheckNamesByStatus([
        makeResult('lint', 'passed'),
        makeResult('test', 'failed'),
        makeResult('build', 'skipped'),
      ]),
    ).toEqual({
      failedCheckNames: ['test'],
      passedCheckNames: ['lint'],
      skippedCheckNames: ['build'],
    });
  });
});
