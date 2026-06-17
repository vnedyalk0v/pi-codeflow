import { describe, expect, it } from 'vitest';

import {
  summarizeCheckResults,
  type CodeflowCheckRunResult,
} from '../../src/index';

function makeRun(overrides: Partial<CodeflowCheckRunResult>): CodeflowCheckRunResult {
  return {
    status: 'passed',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1000,
    results: [],
    summary: '',
    failedCheckNames: [],
    passedCheckNames: [],
    skippedCheckNames: [],
    ...overrides,
  };
}

describe('summarizeCheckResults', () => {
  it('formats passed checks compactly', () => {
    const summary = summarizeCheckResults(
      makeRun({
        status: 'passed',
        results: [
          {
            name: 'lint',
            command: 'npm run lint',
            status: 'passed',
            exitCode: 0,
            signal: null,
            startedAt: '2026-01-01T00:00:00.000Z',
            finishedAt: '2026-01-01T00:00:01.200Z',
            durationMs: 1200,
            stdout: 'ok\n',
            stderr: '',
            summary: 'lint passed.',
            required: true,
          },
        ],
        passedCheckNames: ['lint'],
      }),
    );

    expect(summary).toContain('Codeflow checks passed.');
    expect(summary).toContain('- lint: passed in 1.2s');
  });

  it('formats failures with command, exit code, duration, and last output lines', () => {
    const summary = summarizeCheckResults(
      makeRun({
        status: 'failed',
        failedCheckNames: ['test'],
        results: [
          {
            name: 'test',
            command: 'npm test',
            status: 'failed',
            exitCode: 1,
            signal: null,
            startedAt: '2026-01-01T00:00:00.000Z',
            finishedAt: '2026-01-01T00:00:04.100Z',
            durationMs: 4100,
            stdout: 'ignored\n',
            stderr: 'line 1\nline 2\nbad\n',
            summary: 'test failed.',
            required: true,
          },
        ],
      }),
    );

    expect(summary).toContain('Codeflow checks failed.');
    expect(summary).toContain('- test: `npm test` exited with code 1 after 4.1s');
    expect(summary).toContain('Last output lines for test:');
    expect(summary).toContain('bad');
    expect(summary).toContain('Fix the failing check output');
  });

  it('redacts likely secrets before adding output to summaries', () => {
    const summary = summarizeCheckResults(
      makeRun({
        status: 'failed',
        failedCheckNames: ['test'],
        results: [
          {
            name: 'test',
            command: 'npm test --token=ghp_abcdefghijklmnopqrstuvwxyz123456',
            status: 'failed',
            exitCode: 1,
            signal: null,
            startedAt: '2026-01-01T00:00:00.000Z',
            finishedAt: '2026-01-01T00:00:01.000Z',
            durationMs: 1000,
            stdout: '',
            stderr: 'Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz123456\npassword=super-secret\n',
            summary: 'test failed.',
            required: true,
          },
        ],
      }),
    );

    expect(summary).toContain('Authorization: Bearer [REDACTED]');
    expect(summary).toContain('password=[REDACTED]');
    expect(summary).not.toContain('super-secret');
    expect(summary).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
    expect(summary).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
  });

  it('strips ANSI escape sequences and truncates large output in summaries', () => {
    const largeOutput = Array.from({ length: 40 }, (_, index) => `\u001B[31mline ${index}\u001B[0m`).join('\n');
    const summary = summarizeCheckResults(
      makeRun({
        status: 'failed',
        failedCheckNames: ['test'],
        results: [
          {
            name: 'test',
            command: 'npm test',
            status: 'failed',
            exitCode: 1,
            signal: null,
            startedAt: '2026-01-01T00:00:00.000Z',
            finishedAt: '2026-01-01T00:00:01.000Z',
            durationMs: 1000,
            stdout: '',
            stderr: largeOutput,
            summary: 'test failed.',
            required: true,
          },
        ],
      }),
    );

    expect(summary).not.toContain('\u001B');
    expect(summary).toContain('[truncated to last 8 lines]');
    expect(summary).toContain('line 39');
    expect(summary).not.toContain('line 1\nline 2\nline 3');
  });
});
