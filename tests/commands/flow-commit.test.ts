import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  CodeflowCommitError,
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  parseFlowCommitArguments,
  readFlowCommitPayloadFile,
  runFlowCommit,
  type CodeflowCommitPayload,
  type FlowCommitResult,
} from '../../src/index';
import { registerCodeflowExtension } from '../../src/extension';
import { GitError } from '../../src/git/git-errors';
import type { GitClient } from '../../src/git/git-client';
import { createCodeflowSessionState } from '../../src/state/session-state';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd });
  return result.stdout.trim();
}

async function makeRepo(branch = 'feat/flow-commit-test'): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'codeflow-flow-commit-'));
  await git(repo, ['init']);
  await git(repo, ['config', 'user.email', 'codeflow@example.test']);
  await git(repo, ['config', 'user.name', 'Codeflow Test']);
  await git(repo, ['checkout', '-b', branch]);
  await writeFile(path.join(repo, 'README.md'), '# Test\n', 'utf8');
  await git(repo, ['add', 'README.md']);
  await git(repo, ['commit', '-m', 'initial']);
  return repo;
}

async function stageChange(repo: string, file = 'feature.txt', text = 'feature\n'): Promise<void> {
  await writeFile(path.join(repo, file), text, 'utf8');
  await git(repo, ['add', file]);
}

function payload(overrides: Partial<CodeflowCommitPayload> = {}): CodeflowCommitPayload {
  return {
    type: 'feat',
    scope: 'commits',
    summary: 'implement flow commit',
    context: 'Codeflow needs template-rendered commits.',
    changes: ['Added /flow-commit behavior.'],
    verification: ['npm test'],
    risk: 'Medium. This performs a local git commit.',
    refs: ['#11'],
    ...overrides,
  };
}

function passedCheckState() {
  const state = createCodeflowSessionState({ phase: 'ready_to_commit' });
  state.checks.lastRun = {
    status: 'passed',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1000,
    results: [],
  };
  return state;
}

describe('parseFlowCommitArguments', () => {
  it('parses payload, dry-run, and override flags', () => {
    expect(
      parseFlowCommitArguments('--dry-run --allow-unverified --payload .pi/codeflow/commit.json'),
    ).toEqual({
      dryRun: true,
      allowUnverified: true,
      allowReservedBranch: false,
      payloadPath: '.pi/codeflow/commit.json',
    });
  });

  it('rejects unsupported flags and freeform arguments', () => {
    expect(() => parseFlowCommitArguments('--all')).toThrow(CodeflowCommitError);
    expect(() => parseFlowCommitArguments('git commit')).toThrow(CodeflowCommitError);
  });
});

describe('readFlowCommitPayloadFile', () => {
  it('reads structured payload JSON from a path', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'codeflow-payload-'));
    const payloadPath = path.join(dir, 'commit-payload.json');
    await writeFile(payloadPath, JSON.stringify(payload()), 'utf8');

    await expect(readFlowCommitPayloadFile(payloadPath)).resolves.toMatchObject({
      summary: 'implement flow commit',
    });
  });

  it('returns a clear error for invalid payload JSON', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'codeflow-payload-'));
    const payloadPath = path.join(dir, 'commit-payload.json');
    await writeFile(payloadPath, '{', 'utf8');

    await expect(readFlowCommitPayloadFile(payloadPath)).rejects.toMatchObject({
      code: 'invalid_payload_json',
    });
  });
});

describe('runFlowCommit', () => {
  it('dry-run returns the rendered message without committing', async () => {
    const repo = await makeRepo();
    await stageChange(repo);
    const before = await git(repo, ['rev-parse', 'HEAD']);
    const result = await runFlowCommit({
      cwd: repo,
      payload: payload(),
      dryRun: true,
      sessionState: passedCheckState(),
    });
    const after = await git(repo, ['rev-parse', 'HEAD']);

    expect(result.status).toBe('dry_run');
    expect(result.commitSha).toBeNull();
    expect(result.message).toContain('feat(commits): implement flow commit');
    expect(result.sessionState.lifecycle.phase).toBe('ready_to_commit');
    expect(after).toBe(before);
  });

  it('returns a clear error for invalid payloads', async () => {
    const repo = await makeRepo();
    await stageChange(repo);

    await expect(
      runFlowCommit({ cwd: repo, payload: payload({ summary: 'wip' }) }),
    ).rejects.toMatchObject({ code: 'invalid_payload' });
  });

  it('returns a clear error when no staged changes exist', async () => {
    const repo = await makeRepo();

    await expect(runFlowCommit({ cwd: repo, payload: payload() })).rejects.toMatchObject({
      code: 'no_staged_changes',
    });
  });

  it('creates a commit from staged changes and stores commit metadata', async () => {
    const repo = await makeRepo();
    await stageChange(repo);
    const result = await runFlowCommit({
      cwd: repo,
      payload: payload(),
      sessionState: passedCheckState(),
    });
    const message = await git(repo, ['log', '-1', '--pretty=%B']);

    expect(result.status).toBe('committed');
    expect(result.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(message).toBe(result.message);
    expect(result.sessionState.lifecycle.phase).toBe('committed');
    expect(result.sessionState.commits.lastCommit).toMatchObject({
      sha: result.commitSha,
      title: 'feat(commits): implement flow commit',
      refs: ['#11'],
    });
  });

  it('honors allowUnverified for payloads with no verification entries', async () => {
    const repo = await makeRepo();
    await stageChange(repo);
    const result = await runFlowCommit({
      cwd: repo,
      payload: payload({ verification: [] }),
      allowUnverified: true,
    });

    expect(result.status).toBe('committed');
    expect(result.message).toContain(
      '- Not provided; unverified commit payload was explicitly allowed.',
    );
  });

  it('does not use config allowUnverifiedCommits to waive payload verification', async () => {
    const repo = await makeRepo();
    await stageChange(repo);
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      commits: { allowUnverifiedCommits: true },
    } as Record<string, unknown>);

    await expect(
      runFlowCommit({
        cwd: repo,
        payload: payload({ verification: [] }),
        config,
      }),
    ).rejects.toMatchObject({ code: 'invalid_payload' });
  });

  it('leaves unstaged changes uncommitted and returns a warning', async () => {
    const repo = await makeRepo();
    await stageChange(repo, 'staged.txt', 'staged\n');
    await writeFile(path.join(repo, 'README.md'), '# Test\nunstaged\n', 'utf8');
    const result = await runFlowCommit({
      cwd: repo,
      payload: payload(),
      allowUnverified: true,
    });
    const status = await git(repo, ['status', '--porcelain=v1']);

    expect(result.warnings).toContain('Unstaged changes are present and will not be committed.');
    expect(status).toContain('M README.md');
  });

  it('refuses commits on reserved branches', async () => {
    const repo = await makeRepo('dev');
    await stageChange(repo);

    await expect(runFlowCommit({ cwd: repo, payload: payload() })).rejects.toMatchObject({
      code: 'reserved_branch',
    });
  });

  it('uses latest check state policy for passed, failed, missing, and dry-run states', async () => {
    const passedRepo = await makeRepo();
    await stageChange(passedRepo);
    await expect(
      runFlowCommit({ cwd: passedRepo, payload: payload(), sessionState: passedCheckState() }),
    ).resolves.toMatchObject({ status: 'committed' });

    const failedRepo = await makeRepo();
    await stageChange(failedRepo);
    const failedState = createCodeflowSessionState({ phase: 'ready_to_commit' });
    failedState.checks.lastRun = {
      status: 'failed',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1000,
      results: [],
    };
    await expect(
      runFlowCommit({ cwd: failedRepo, payload: payload(), sessionState: failedState }),
    ).rejects.toMatchObject({ code: 'checks_failed' });

    const missingRepo = await makeRepo();
    await stageChange(missingRepo);
    const missingResult = await runFlowCommit({
      cwd: missingRepo,
      payload: payload(),
      allowUnverified: true,
    });
    expect(missingResult.warnings.join('\n')).toContain('No latest /flow-check state found');

    const configAllowedRepo = await makeRepo();
    await stageChange(configAllowedRepo);
    const allowUnverifiedConfig = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      commits: { allowUnverifiedCommits: true },
    } as Record<string, unknown>);
    const configAllowedResult = await runFlowCommit({
      cwd: configAllowedRepo,
      payload: payload(),
      config: allowUnverifiedConfig,
    });
    expect(configAllowedResult.status).toBe('committed');
    expect(configAllowedResult.warnings.join('\n')).toContain(
      'No latest /flow-check state found',
    );

    const dryRepo = await makeRepo();
    await stageChange(dryRepo);
    const dryBefore = await git(dryRepo, ['rev-parse', 'HEAD']);
    const dryResult = await runFlowCommit({
      cwd: dryRepo,
      payload: payload(),
      dryRun: true,
      sessionState: failedState,
    });
    expect(dryResult.status).toBe('dry_run');
    await expect(git(dryRepo, ['rev-parse', 'HEAD'])).resolves.toBe(dryBefore);
  });

  it('returns CodeflowCommitError when git commit fails', async () => {
    const fakeGit = {
      getCurrentBranch: async () => 'feat/fake',
      getStatus: async () => ({
        clean: false,
        raw: 'A  file.txt\n',
        entries: [{ indexStatus: 'A', worktreeStatus: ' ', path: 'file.txt' }],
      }),
      commitWithMessageFile: async () => {
        throw new GitError({
          code: 'git_command_failed',
          message: 'commit hook failed',
          exitCode: 1,
          stderr: 'hook failed\n',
        });
      },
    } as unknown as GitClient;

    await expect(
      runFlowCommit({
        cwd: '/tmp',
        payload: payload(),
        gitClient: fakeGit,
        allowUnverified: true,
      }),
    ).rejects.toMatchObject({
      name: 'CodeflowCommitError',
      code: 'git_commit_failed',
      details: expect.objectContaining({ exitCode: 1, stderr: 'hook failed\n' }),
    });
  });
});

describe('/flow-commit command registration', () => {
  it('registers the command and reads payload path before dry-run', async () => {
    const repo = await makeRepo();
    await stageChange(repo);
    const payloadPath = path.join(repo, 'commit-payload.json');
    await writeFile(payloadPath, JSON.stringify(payload()), 'utf8');
    const notifications: Array<{ message: string; level: string }> = [];
    const handlers = new Map<string, (args: string, context: { cwd: string; ui: { notify: (message: string, level: 'info' | 'warning' | 'error') => void } }) => Promise<unknown>>();

    registerCodeflowExtension({
      on() {},
      registerCommand(name, options) {
        handlers.set(name, options.handler);
      },
    });

    const result = await handlers.get('flow-commit')?.('--dry-run --payload commit-payload.json', {
      cwd: repo,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    }) as FlowCommitResult;

    expect(result.status).toBe('dry_run');
    expect(notifications[0]?.level).toBe('info');
    expect(notifications[0]?.message).toContain('Codeflow commit dry-run.');
    expect(notifications[0]?.message).toContain('Rendered commit message:');
  });

  it('surfaces invalid payload errors and does not push or open a PR', async () => {
    const repo = await makeRepo();
    await stageChange(repo);
    await writeFile(path.join(repo, 'bad-payload.json'), JSON.stringify({ message: 'feat: bad' }), 'utf8');
    const notifications: Array<{ message: string; level: string }> = [];
    const handlers = new Map<string, (args: string, context: { cwd: string; ui: { notify: (message: string, level: 'info' | 'warning' | 'error') => void } }) => Promise<unknown>>();

    registerCodeflowExtension({
      on() {},
      registerCommand(name, options) {
        handlers.set(name, options.handler);
      },
    });

    await expect(
      handlers.get('flow-commit')?.('--payload bad-payload.json', {
        cwd: repo,
        ui: {
          notify(message, level) {
            notifications.push({ message, level });
          },
        },
      }),
    ).rejects.toThrow(CodeflowCommitError);

    expect(notifications[0]).toEqual({
      level: 'error',
      message: '/flow-commit failed: Commit payload failed validation.',
    });
  });
});
