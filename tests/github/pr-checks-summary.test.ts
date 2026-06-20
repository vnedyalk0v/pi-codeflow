import { describe, expect, it } from 'vitest';

import {
  summarizeGitHubPrChecks,
  type CodeflowPrCheck,
  type CodeflowPrChecksResult,
} from '../../src/index';

function check(overrides: Partial<CodeflowPrCheck>): CodeflowPrCheck {
  return {
    name: 'test',
    workflow: 'CI',
    status: 'passed',
    rawState: 'SUCCESS',
    bucket: 'pass',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:01:14.000Z',
    durationMs: 74000,
    description: null,
    detailsUrl: null,
    required: true,
    ...overrides,
  };
}

function result(overrides: Partial<CodeflowPrChecksResult>): CodeflowPrChecksResult {
  const checks = overrides.checks ?? [];
  const failedChecks = overrides.failedChecks ?? checks.filter((item) => ['failed', 'timed_out', 'cancelled'].includes(item.status));
  const pendingChecks = overrides.pendingChecks ?? checks.filter((item) => item.status === 'pending');
  const passedChecks = overrides.passedChecks ?? checks.filter((item) => item.status === 'passed' || item.status === 'neutral');
  const skippedChecks = overrides.skippedChecks ?? checks.filter((item) => item.status === 'skipped');

  return {
    status: 'passed',
    prNumber: 123,
    prUrl: 'https://github.com/org/repo/pull/123',
    baseBranch: 'dev',
    headBranch: 'feat/checks',
    headSha: 'a'.repeat(40),
    requiredOnly: true,
    watched: true,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:14.000Z',
    durationMs: 74000,
    checks,
    failedChecks,
    pendingChecks,
    passedChecks,
    skippedChecks,
    summary: '',
    warnings: [],
    ...overrides,
  };
}

describe('summarizeGitHubPrChecks', () => {
  it('formats passed summaries with PR number, required mode, and checks', () => {
    const summary = summarizeGitHubPrChecks(result({ checks: [check({ name: 'build' })] }));

    expect(summary).toContain('GitHub checks passed.');
    expect(summary).toContain('PR: #123');
    expect(summary).toContain('Mode: required checks');
    expect(summary).toContain('- build (CI): passed in 1m 14s');
  });

  it('formats mixed passed and skipped summaries without duplicating skipped checks', () => {
    const summary = summarizeGitHubPrChecks(result({
      status: 'passed',
      checks: [
        check({ name: 'build', status: 'passed', bucket: 'pass' }),
        check({ name: 'docs', status: 'skipped', bucket: 'skipping', rawState: 'SKIPPED' }),
      ],
    }));

    expect(summary).toContain('GitHub checks passed.');
    expect(summary).toContain('- build (CI): passed in 1m 14s');
    expect(summary).toContain('Skipped:\n- docs (CI): skipped');
    expect(summary).not.toContain('- docs (CI): skipped in');
    expect(summary.match(/docs \(CI\): skipped/g)).toHaveLength(1);
  });

  it('formats pending summaries with pending durations', () => {
    const summary = summarizeGitHubPrChecks(result({
      status: 'pending',
      checks: [check({ name: 'e2e', status: 'pending', bucket: 'pending', completedAt: null, durationMs: 245000 })],
    }));

    expect(summary).toContain('GitHub checks are still pending.');
    expect(summary).toContain('Pending:');
    expect(summary).toContain('- e2e (CI): pending for 4m 05s');
  });

  it('formats failed summaries with details links and pending checks', () => {
    const failed = check({
      name: 'test',
      status: 'failed',
      bucket: 'fail',
      detailsUrl: 'https://github.com/org/repo/actions/runs/2',
      description: '\u001B[31mfailed\u001B[0m token=ghp_abcdefghijklmnopqrstuvwxyz123456 password=hunter2',
      durationMs: 131000,
    });
    const pending = check({ name: 'e2e', status: 'pending', bucket: 'pending', durationMs: 245000 });
    const summary = summarizeGitHubPrChecks(result({ status: 'failed', checks: [failed, pending] }));

    expect(summary).toContain('GitHub checks failed.');
    expect(summary).toContain('- test (CI): failed after 2m 11s');
    expect(summary).toContain('Details: https://github.com/org/repo/actions/runs/2');
    expect(summary).toContain('Context: failed token=[REDACTED] password=[REDACTED]');
    expect(summary).not.toContain('\u001B');
    expect(summary).not.toContain('hunter2');
    expect(summary).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
    expect(summary).toContain('Pending:');
    expect(summary).toContain('Inspect the failed check logs');
  });

  it('formats timeout, no-checks, and all-checks mode clearly', () => {
    const timeout = summarizeGitHubPrChecks(result({
      status: 'pending',
      requiredOnly: false,
      checks: [check({ name: 'test', status: 'pending', bucket: 'pending' })],
      warnings: ['GitHub checks watch timed out before completion.'],
    }));
    const noChecks = summarizeGitHubPrChecks(result({ status: 'no_checks', checks: [] }));

    expect(timeout).toContain('GitHub checks watch timed out before completion.');
    expect(timeout).toContain('Mode: all checks');
    expect(noChecks).toContain('No GitHub PR checks were found.');
    expect(noChecks).toContain('Confirm the PR has checks configured');
  });
});
