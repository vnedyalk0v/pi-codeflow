import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

  it('handles command timeouts and kills child process trees', async () => {
    const cwd = await makeTempDir();
    const childScript = path.join(cwd, 'child.js');
    const parentScript = path.join(cwd, 'parent.js');
    const lateFile = path.join(cwd, 'late.txt');

    await writeFile(
      childScript,
      `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(lateFile)}, 'late'), 250);\nsetTimeout(() => {}, 1000);\n`,
      'utf8',
    );
    await writeFile(
      parentScript,
      `require('child_process').spawn(process.execPath, [${JSON.stringify(childScript)}], { stdio: 'ignore' });\nsetTimeout(() => {}, 1000);\n`,
      'utf8',
    );

    const result = await runCodeflowChecks({
      cwd,
      checks: [
        {
          name: 'slow',
          command: `${node} ${JSON.stringify(parentScript)}`,
          timeoutMs: 50,
        },
      ],
    });

    await delay(400);

    expect(result.status).toBe('failed');
    expect(result.results[0]).toMatchObject({
      name: 'slow',
      status: 'timed_out',
      exitCode: null,
    });
    await expect(fileExists(lateFile)).resolves.toBe(false);
  });

  it('rejects check timeouts above one hour', async () => {
    await expect(
      runCodeflowChecks({
        dryRun: true,
        checks: [
          {
            name: 'too slow',
            command: `${node} -e "console.log('ok')"`,
            timeoutMs: 3_600_001,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'invalid_check_config',
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
