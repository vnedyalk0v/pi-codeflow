import { access, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCodeflowChecks } from '../../src/index';

const node = JSON.stringify(process.execPath);

async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'codeflow-check-runner-'));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('runCodeflowChecks', () => {
  it('runs checks in order and captures stdout, stderr, exit code, and duration', async () => {
    const cwd = await makeTempDir();
    const result = await runCodeflowChecks({
      cwd,
      checks: [
        {
          name: 'first',
          command: `${node} -e "require('fs').appendFileSync('order.txt','first\\n'); console.log('one')"`,
        },
        {
          name: 'second',
          command: `${node} -e "require('fs').appendFileSync('order.txt','second\\n'); console.error('warn')"`,
        },
      ],
      stopOnFailure: false,
    });

    await expect(readFile(path.join(cwd, 'order.txt'), 'utf8')).resolves.toBe(
      'first\nsecond\n',
    );
    expect(result.status).toBe('passed');
    expect(result.results.map((check) => check.name)).toEqual(['first', 'second']);
    expect(result.results[0]).toMatchObject({ stdout: 'one\n', stderr: '', exitCode: 0 });
    expect(result.results[1]?.stderr).toBe('warn\n');
    expect(result.results[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('stops after the first failed required check when stopOnFailure is true', async () => {
    const cwd = await makeTempDir();
    const result = await runCodeflowChecks({
      cwd,
      checks: [
        { name: 'pass', command: `${node} -e "console.log('ok')"` },
        {
          name: 'fail',
          command: `${node} -e "console.error('bad'); process.exit(1)"`,
        },
        {
          name: 'later',
          command: `${node} -e "require('fs').writeFileSync('later.txt','ran')"`,
        },
      ],
      stopOnFailure: true,
    });

    expect(result.status).toBe('failed');
    expect(result.failedCheckNames).toEqual(['fail']);
    expect(result.skippedCheckNames).toEqual(['later']);
    expect(result.results.map((check) => check.status)).toEqual([
      'passed',
      'failed',
      'skipped',
    ]);
    await expect(fileExists(path.join(cwd, 'later.txt'))).resolves.toBe(false);
  });

  it('continues after a failed required check when stopOnFailure is false', async () => {
    const cwd = await makeTempDir();
    const result = await runCodeflowChecks({
      cwd,
      checks: [
        {
          name: 'fail',
          command: `${node} -e "console.error('bad'); process.exit(1)"`,
        },
        { name: 'later', command: `${node} -e "console.log('later')"` },
      ],
      stopOnFailure: false,
    });

    expect(result.status).toBe('failed');
    expect(result.results.map((check) => check.status)).toEqual(['failed', 'passed']);
    expect(result.passedCheckNames).toEqual(['later']);
  });

  it('keeps optional check failures from failing the overall run', async () => {
    const cwd = await makeTempDir();
    const result = await runCodeflowChecks({
      cwd,
      checks: [
        {
          name: 'optional audit',
          command: `${node} -e "console.error('optional bad'); process.exit(1)"`,
          required: false,
        },
        { name: 'required pass', command: `${node} -e "console.log('ok')"` },
      ],
      stopOnFailure: true,
    });

    expect(result.status).toBe('passed');
    expect(result.failedCheckNames).toEqual(['optional audit']);
    expect(result.passedCheckNames).toEqual(['required pass']);
    expect(result.summary).toContain('Codeflow required checks passed');
  });

  it('handles command timeouts', async () => {
    const cwd = await makeTempDir();
    const result = await runCodeflowChecks({
      cwd,
      checks: [
        {
          name: 'slow',
          command: `${node} -e "setTimeout(() => {}, 1000)"`,
          timeoutMs: 50,
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.results[0]).toMatchObject({
      name: 'slow',
      status: 'timed_out',
      exitCode: null,
    });
  });

  it('handles an empty check list', async () => {
    const result = await runCodeflowChecks({ checks: [] });

    expect(result.status).toBe('no_checks');
    expect(result.results).toEqual([]);
    expect(result.summary).toContain('No checks are configured.');
  });

  it('dry-run records planned checks without executing commands', async () => {
    const cwd = await makeTempDir();
    const result = await runCodeflowChecks({
      cwd,
      checks: [
        {
          name: 'would write',
          command: `${node} -e "require('fs').writeFileSync('dry-run.txt','ran')"`,
        },
      ],
      dryRun: true,
    });

    expect(result.status).toBe('skipped');
    expect(result.skippedCheckNames).toEqual(['would write']);
    await expect(fileExists(path.join(cwd, 'dry-run.txt'))).resolves.toBe(false);
  });
});
