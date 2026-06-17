import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { GitClient } from '../../src/git/git-client';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'codeflow-git-client-'));
  await git(repo, ['init']);
  await git(repo, ['config', 'user.email', 'codeflow@example.test']);
  await git(repo, ['config', 'user.name', 'Codeflow Test']);
  await git(repo, ['checkout', '-b', 'dev']);
  await writeFile(path.join(repo, 'README.md'), '# Test\n', 'utf8');
  await git(repo, ['add', 'README.md']);
  await git(repo, ['commit', '-m', 'initial']);
  return repo;
}

describe('GitClient', () => {
  it('reads current branch and clean status', async () => {
    const repo = await makeRepo();
    const client = new GitClient({ cwd: repo });

    await expect(client.getCurrentBranch()).resolves.toBe('dev');
    await expect(client.getStatus()).resolves.toMatchObject({ clean: true });
  });

  it('detects dirty status', async () => {
    const repo = await makeRepo();
    await writeFile(path.join(repo, 'README.md'), '# Changed\n', 'utf8');
    const client = new GitClient({ cwd: repo });

    const status = await client.getStatus();

    expect(status.clean).toBe(false);
    expect(status.entries[0]?.path).toBe('README.md');
  });

  it('creates and checks out a branch from an explicit ref', async () => {
    const repo = await makeRepo();
    const client = new GitClient({ cwd: repo });

    await expect(client.branchExists('feat/test')).resolves.toBe(false);
    await client.createBranchFromRef('feat/test', 'dev');
    await expect(client.branchExists('feat/test')).resolves.toBe(true);
    await client.checkoutBranch('feat/test');
    await expect(client.getCurrentBranch()).resolves.toBe('feat/test');
  });
});
