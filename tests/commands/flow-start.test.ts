import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  FlowStartError,
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  parseFlowStartArguments,
  runFlowStart,
  type FlowStartResult,
} from '../../src/index';
import { registerCodeflowExtension } from '../../src/extension';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd });
  return result.stdout.trim();
}

async function makeRepo(branch = 'dev'): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'codeflow-flow-start-'));
  await git(repo, ['init']);
  await git(repo, ['config', 'user.email', 'codeflow@example.test']);
  await git(repo, ['config', 'user.name', 'Codeflow Test']);
  await git(repo, ['checkout', '-b', branch]);
  await writeFile(path.join(repo, 'README.md'), '# Test\n', 'utf8');
  await git(repo, ['add', 'README.md']);
  await git(repo, ['commit', '-m', 'initial']);
  return repo;
}

async function currentBranch(repo: string): Promise<string> {
  return git(repo, ['branch', '--show-current']);
}

describe('parseFlowStartArguments', () => {
  it('parses type, ticket, emergency, and dry-run flags', () => {
    expect(
      parseFlowStartArguments(
        '--ticket BILL-142 --type feat --emergency --dry-run "Add Stripe webhook"',
      ),
    ).toEqual({
      task: 'Add Stripe webhook',
      type: 'feat',
      ticket: 'BILL-142',
      emergency: true,
      dryRun: true,
    });
  });
});

describe('runFlowStart', () => {
  it('returns expected dry-run result and next actions', async () => {
    const repo = await makeRepo();
    const result = await runFlowStart({
      cwd: repo,
      task: 'Fix checkout timeout',
      dryRun: true,
      config: getDefaultCodeflowConfig(),
    });

    expect(result).toMatchObject({
      task: 'Fix checkout timeout',
      type: 'fix',
      baseBranch: 'dev',
      workBranch: 'fix/fix-checkout-timeout',
      startedFromBranch: 'dev',
      currentPhase: 'branch_prepared',
      dryRun: true,
      createdBranch: false,
      switchedBranch: false,
    });
    expect(result.nextExpectedActions.join('\n')).toContain('/flow-plan');
    await expect(currentBranch(repo)).resolves.toBe('dev');
  });

  it('creates and switches to a semantic branch when starting from a reserved branch', async () => {
    const repo = await makeRepo('dev');
    const result = await runFlowStart({
      cwd: repo,
      task: 'Add Google OAuth login',
      type: 'feat',
      config: getDefaultCodeflowConfig(),
    });

    expect(result.createdBranch).toBe(true);
    expect(result.switchedBranch).toBe(true);
    expect(result.startedFromBranch).toBe('dev');
    expect(result.workBranch).toBe('feat/add-google-oauth-login');
    await expect(currentBranch(repo)).resolves.toBe('feat/add-google-oauth-login');
  });

  it('parses explicit tickets into the branch name', async () => {
    const repo = await makeRepo();
    const result = await runFlowStart({
      cwd: repo,
      task: 'Add Stripe webhook verification',
      type: 'feat',
      ticket: 'BILL-142',
      dryRun: true,
      config: getDefaultCodeflowConfig(),
    });

    expect(result.ticket).toBe('BILL-142');
    expect(result.workBranch).toBe('feat/BILL-142-add-stripe-webhook-verification');
  });

  it('supports emergency starts by using a hotfix branch type', async () => {
    const repo = await makeRepo();
    const result = await runFlowStart({
      cwd: repo,
      task: 'Checkout is down in production',
      emergency: true,
      dryRun: true,
      config: getDefaultCodeflowConfig(),
    });

    expect(result.type).toBe('hotfix');
    expect(result.workBranch).toBe('hotfix/checkout-is-down-in-production');
  });

  it('rejects unsupported emergency behavior', async () => {
    const repo = await makeRepo();
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      emergency: { defaultPath: 'human_only' },
    } as Record<string, unknown>);

    await expect(
      runFlowStart({
        cwd: repo,
        task: 'Checkout is down in production',
        emergency: true,
        dryRun: true,
        config,
      }),
    ).rejects.toMatchObject({ code: 'unsupported_emergency' });
  });

  it('uses numeric collision suffixes when a branch exists', async () => {
    const repo = await makeRepo();
    await git(repo, ['branch', 'feat/add-google-oauth-login', 'dev']);
    const result = await runFlowStart({
      cwd: repo,
      task: 'Add Google OAuth login',
      type: 'feat',
      dryRun: true,
      config: getDefaultCodeflowConfig(),
    });

    expect(result.workBranch).toBe('feat/add-google-oauth-login-2');
  });

  it('uses a collision suffix when a branch only exists on the remote', async () => {
    const repo = await makeRepo();
    const remote = await mkdtemp(path.join(os.tmpdir(), 'codeflow-flow-start-remote-'));
    await git(remote, ['init', '--bare']);
    await git(repo, ['remote', 'add', 'origin', remote]);
    await git(repo, ['push', 'origin', 'dev']);
    await git(repo, ['push', 'origin', 'dev:refs/heads/feat/add-google-oauth-login']);
    await git(repo, ['update-ref', '-d', 'refs/remotes/origin/feat/add-google-oauth-login']);

    const result = await runFlowStart({
      cwd: repo,
      task: 'Add Google OAuth login',
      type: 'feat',
      dryRun: true,
      config: getDefaultCodeflowConfig(),
    });

    expect(result.workBranch).toBe('feat/add-google-oauth-login-2');
  });

  it('errors when the working tree is dirty', async () => {
    const repo = await makeRepo();
    await writeFile(path.join(repo, 'README.md'), '# Dirty\n', 'utf8');

    await expect(
      runFlowStart({
        cwd: repo,
        task: 'Add login',
        dryRun: true,
        config: getDefaultCodeflowConfig(),
      }),
    ).rejects.toMatchObject({ code: 'dirty_working_tree' });
  });

  it('errors when the configured base branch is missing and fallback is blocked', async () => {
    const repo = await makeRepo('main');

    await expect(
      runFlowStart({
        cwd: repo,
        task: 'Add login',
        dryRun: true,
        config: getDefaultCodeflowConfig(),
      }),
    ).rejects.toMatchObject({ code: 'missing_base_branch' });
  });

  it('uses fallback when configured and available', async () => {
    const repo = await makeRepo('main');
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      baseBranches: {
        missingDefaultBehavior: 'fallback',
        fallback: 'main',
        allowed: ['dev', 'main'],
      },
    } as Record<string, unknown>);

    const result = await runFlowStart({
      cwd: repo,
      task: 'Add login',
      dryRun: true,
      config,
    });

    expect(result.baseBranch).toBe('main');
    expect(result.warnings.join('\n')).toContain('using fallback main');
  });

  it('prefers origin/base when it is available', async () => {
    const repo = await makeRepo('dev');
    const remote = await mkdtemp(path.join(os.tmpdir(), 'codeflow-flow-start-remote-'));
    await git(remote, ['init', '--bare']);
    await git(repo, ['remote', 'add', 'origin', remote]);
    await git(repo, ['push', 'origin', 'dev']);
    const originDevSha = await git(repo, ['rev-parse', 'origin/dev']);
    await writeFile(path.join(repo, 'README.md'), '# Local dev ahead\n', 'utf8');
    await git(repo, ['add', 'README.md']);
    await git(repo, ['commit', '-m', 'local dev ahead']);

    const result = await runFlowStart({
      cwd: repo,
      task: 'Add remote based branch',
      type: 'feat',
      config: getDefaultCodeflowConfig(),
    });
    const workBranchSha = await git(repo, ['rev-parse', result.workBranch]);

    expect(result.baseBranch).toBe('dev');
    expect(workBranchSha).toBe(originDevSha);
  });
});

describe('/flow-start command registration', () => {
  it('registers the command and passes parsed options to runFlowStart', async () => {
    const calls: unknown[] = [];
    const notifications: Array<{ message: string; level: string }> = [];
    let handler:
      | ((args: string, context: { cwd: string; ui: { notify: (message: string, level: 'info' | 'warning' | 'error') => void } }) => Promise<FlowStartResult>)
      | undefined;

    registerCodeflowExtension(
      {
        on() {},
        registerCommand(name, options) {
          if (name === 'flow-start') {
            handler = options.handler as typeof handler;
          }
        },
      },
      {
        runFlowStart: async (options) => {
          calls.push(options);
          return {
            task: options.task,
            type: 'feat',
            ticket: options.ticket ?? null,
            baseBranch: 'dev',
            workBranch: 'feat/BILL-142-add-login',
            startedFromBranch: 'dev',
            currentPhase: 'branch_prepared',
            nextExpectedActions: ['Move to planning.'],
            dryRun: options.dryRun === true,
            createdBranch: false,
            switchedBranch: false,
            warnings: [],
          };
        },
      },
    );

    const result = await handler?.('--type feat --ticket BILL-142 --dry-run "Add login"', {
      cwd: '/tmp/project',
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    });

    expect(calls[0]).toMatchObject({
      cwd: '/tmp/project',
      task: 'Add login',
      type: 'feat',
      ticket: 'BILL-142',
      dryRun: true,
    });
    expect(result?.workBranch).toBe('feat/BILL-142-add-login');
    expect(notifications[0]?.level).toBe('info');
    expect(notifications[0]?.message).toContain('Codeflow task started');
  });

  it('surfaces command errors without running checks, commits, pushes, or PR actions', async () => {
    const notifications: Array<{ message: string; level: string }> = [];
    let handler:
      | ((args: string, context: { cwd: string; ui: { notify: (message: string, level: 'info' | 'warning' | 'error') => void } }) => Promise<FlowStartResult>)
      | undefined;

    registerCodeflowExtension(
      {
        on() {},
        registerCommand(name, options) {
          if (name === 'flow-start') {
            handler = options.handler as typeof handler;
          }
        },
      },
      {
        runFlowStart: async () => {
          throw new FlowStartError({
            code: 'dirty_working_tree',
            message: 'Working tree has uncommitted changes.',
          });
        },
      },
    );

    await expect(
      handler?.('Add login', {
        cwd: '/tmp/project',
        ui: {
          notify(message, level) {
            notifications.push({ message, level });
          },
        },
      }),
    ).rejects.toThrow(FlowStartError);

    expect(notifications[0]).toEqual({
      level: 'error',
      message: '/flow-start failed: Working tree has uncommitted changes.',
    });
  });
});
