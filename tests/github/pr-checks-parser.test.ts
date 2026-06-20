import { describe, expect, it } from 'vitest';

import {
  normalizeGitHubPrCheck,
  type CodeflowPrCheckStatus,
} from '../../src/index';
import { parseGitHubPrChecksJson } from '../../src/github/pr-checks-parser';

const now = new Date('2026-01-01T00:05:00.000Z');

function parseRows(rows: unknown[]) {
  return parseGitHubPrChecksJson(JSON.stringify(rows), {
    prNumber: 123,
    prUrl: 'https://github.com/org/repo/pull/123',
    baseBranch: 'dev',
    headBranch: 'feat/checks',
    headSha: 'a'.repeat(40),
    requiredOnly: true,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1000,
    now,
  });
}

describe('normalizeGitHubPrCheck', () => {
  it.each([
    ['pass', 'SUCCESS', 'passed'],
    ['fail', 'FAILURE', 'failed'],
    ['pending', 'IN_PROGRESS', 'pending'],
    ['skipping', 'SKIPPED', 'skipped'],
    ['cancel', 'CANCELLED', 'cancelled'],
    ['fail', 'TIMED_OUT', 'timed_out'],
  ] as Array<[string, string, CodeflowPrCheckStatus]>)('maps bucket %s and state %s to %s', (bucket, state, status) => {
    expect(normalizeGitHubPrCheck({ name: 'test', bucket, state }).status).toBe(status);
  });

  it('maps unknown buckets to unknown and keeps raw state', () => {
    const check = normalizeGitHubPrCheck({ name: 'mystery', bucket: 'new', state: 'ODD' });

    expect(check.bucket).toBe('unknown');
    expect(check.status).toBe('unknown');
    expect(check.rawState).toBe('ODD');
  });

  it('calculates duration from timestamps and handles missing timestamps', () => {
    const completed = normalizeGitHubPrCheck({
      name: 'test',
      bucket: 'pass',
      state: 'SUCCESS',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:02:03.000Z',
    }, { now });
    const missing = normalizeGitHubPrCheck({ name: 'test', bucket: 'pending' }, { now });

    expect(completed.durationMs).toBe(123000);
    expect(missing.durationMs).toBeNull();
  });
});

describe('parseGitHubPrChecksJson', () => {
  it('parses gh pr checks JSON output into Codeflow checks', () => {
    const result = parseRows([
      {
        name: 'test',
        workflow: 'CI',
        bucket: 'pass',
        state: 'SUCCESS',
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:01:00.000Z',
        description: 'Unit tests passed.',
        link: 'https://github.com/org/repo/actions/runs/1',
      },
    ]);

    expect(result).toMatchObject({
      status: 'passed',
      prNumber: 123,
      requiredOnly: true,
      checks: [
        {
          name: 'test',
          workflow: 'CI',
          status: 'passed',
          bucket: 'pass',
          durationMs: 60000,
          description: 'Unit tests passed.',
          detailsUrl: 'https://github.com/org/repo/actions/runs/1',
          required: true,
        },
      ],
    });
  });

  it('redacts sensitive details links before summary or state storage', () => {
    const result = parseRows([
      {
        name: 'deploy',
        workflow: 'CI',
        bucket: 'fail',
        state: 'FAILURE',
        link: '\u001B[31mhttps://ci.example.test/build/1?access_token=super-secret-token&job=deploy\u001B[0m',
      },
    ]);

    expect(result.checks[0]?.detailsUrl).toBe('https://ci.example.test/build/1?access_token=[REDACTED]');
    expect(result.summary).toContain('Details: https://ci.example.test/build/1?access_token=[REDACTED]');
    expect(JSON.stringify(result)).not.toContain('super-secret-token');
    expect(JSON.stringify(result)).not.toContain('\u001B');
  });

  it('redacts sensitive descriptions before returning structured results', () => {
    const result = parseRows([
      {
        name: 'deploy',
        workflow: 'CI',
        bucket: 'fail',
        state: 'FAILURE',
        description: '\u001B[31mfailed token=ghp_abcdefghijklmnopqrstuvwxyz123456 password=hunter2\u001B[0m',
      },
    ]);

    expect(result.checks[0]?.description).toBe('failed token=[REDACTED] password=[REDACTED]');
    expect(result.summary).toContain('Context: failed token=[REDACTED] password=[REDACTED]');
    expect(JSON.stringify(result)).not.toContain('hunter2');
    expect(JSON.stringify(result)).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
    expect(JSON.stringify(result)).not.toContain('\u001B');
  });

  it('treats all returned v1 check rows as required in all-checks mode', () => {
    const result = parseGitHubPrChecksJson(
      JSON.stringify([{ name: 'optional-looking', bucket: 'pass', state: 'SUCCESS' }]),
      {
        requiredOnly: false,
      },
    );

    expect(result.requiredOnly).toBe(false);
    expect(result.checks[0]?.required).toBe(true);
  });

  it('produces a warning for unknown states', () => {
    const result = parseRows([{ name: 'mystery', bucket: 'weird', state: 'ODD' }]);

    expect(result.status).toBe('unknown');
    expect(result.warnings.join('\n')).toContain('unknown state ODD');
  });

  it('returns no_checks without claiming pass for an empty list', () => {
    const result = parseRows([]);

    expect(result.status).toBe('no_checks');
    expect(result.summary).toContain('No GitHub PR checks were found');
  });
});
