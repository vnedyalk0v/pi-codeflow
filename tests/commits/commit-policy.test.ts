import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  createCodeflowSessionState,
} from '../../src/state/session-state';
import {
  createGitCommitFromPayload,
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  type CodeflowCommitPayload,
} from '../../src/index';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd });
  return result.stdout.trim();
}

async function makeRepo(branch = 'feat/commit-policy'): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'codeflow-commit-policy-'));
  await git(repo, ['init']);
  await git(repo, ['config', 'user.email', 'codeflow@example.test']);
  await git(repo, ['config', 'user.name', 'Codeflow Test']);
  await git(repo, ['checkout', '-b', branch]);
  await writeFile(path.join(repo, 'README.md'), '# Test\n', 'utf8');
  await git(repo, ['add', 'README.md']);
  await git(repo, ['commit', '-m', 'initial']);
  return repo;
}

async function stageChange(repo: string, file = 'change.txt', text = 'change\n'): Promise<void> {
  await writeFile(path.join(repo, file), text, 'utf8');
  await git(repo, ['add', file]);
}

function payload(): CodeflowCommitPayload {
  return {
    type: 'feat',
    scope: 'commits',
    summary: 'add flow commit policy',
    context: 'Codeflow needs safe staged-change commits.',
    changes: ['Added commit safety checks.'],
    verification: ['npm test'],
    risk: 'Low. Covered by integration tests.',
    refs: ['#11'],
  };
}

describe('createGitCommitFromPayload policy', () => {
  it('rejects commits with no staged changes', async () => {
    const repo = await makeRepo();

    await expect(
      createGitCommitFromPayload({ cwd: repo, payload: payload() }),
    ).rejects.toMatchObject({ code: 'no_staged_changes' });
  });

  it('rejects commits on reserved branches', async () => {
    const repo = await makeRepo('dev');
    await stageChange(repo);

    await expect(
      createGitCommitFromPayload({ cwd: repo, payload: payload() }),
    ).rejects.toMatchObject({ code: 'reserved_branch' });
  });

  it('allows reserved branch override only when emergency policy allows it', async () => {
    const repo = await makeRepo('dev');
    await stageChange(repo);
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      emergency: { allowReservedBranchWork: true },
    } as Record<string, unknown>);
    const result = await createGitCommitFromPayload({
      cwd: repo,
      payload: payload(),
      config,
      allowReservedBranch: true,
      allowUnverified: true,
    });

    expect(result.status).toBe('committed');
    expect(result.warnings.join('\n')).toContain('reserved branch dev');
  });

  it('blocks failed check state by default and allows it with an explicit unverified override', async () => {
    const blockedRepo = await makeRepo();
    await stageChange(blockedRepo);
    const failedState = createCodeflowSessionState({ phase: 'ready_to_commit' });
    failedState.checks.lastRun = {
      status: 'failed',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1000,
      results: [],
    };

    await expect(
      createGitCommitFromPayload({
        cwd: blockedRepo,
        payload: payload(),
        sessionState: failedState,
      }),
    ).rejects.toMatchObject({ code: 'checks_failed' });

    const allowedRepo = await makeRepo();
    await stageChange(allowedRepo);
    const allowed = await createGitCommitFromPayload({
      cwd: allowedRepo,
      payload: payload(),
      sessionState: failedState,
      allowUnverified: true,
    });

    expect(allowed.status).toBe('committed');
    expect(allowed.warnings.join('\n')).toContain('Latest /flow-check state failed');
  });

  it('commits only staged changes and leaves unstaged changes in the worktree', async () => {
    const repo = await makeRepo();
    await stageChange(repo, 'tracked.txt', 'staged\n');
    await writeFile(path.join(repo, 'README.md'), '# Test\nunstaged\n', 'utf8');

    const result = await createGitCommitFromPayload({
      cwd: repo,
      payload: payload(),
      allowUnverified: true,
    });
    const committedFile = await git(repo, ['show', 'HEAD:tracked.txt']);
    const readme = await readFile(path.join(repo, 'README.md'), 'utf8');
    const status = await git(repo, ['status', '--porcelain=v1']);

    expect(result.status).toBe('committed');
    expect(result.warnings).toContain('Unstaged changes are present and will not be committed.');
    expect(committedFile).toBe('staged');
    expect(readme).toContain('unstaged');
    expect(status).toContain('M README.md');
  });
});
