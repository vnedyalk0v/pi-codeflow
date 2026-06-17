import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CodeflowCheckError,
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  parseFlowCheckArguments,
  runFlowCheck,
  type FlowCheckResult,
} from '../../src/index';
import { registerCodeflowExtension } from '../../src/extension';

const node = JSON.stringify(process.execPath);

async function makeTempProject(configText: string): Promise<string> {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'codeflow-flow-check-'));
  await mkdir(path.join(projectDir, '.pi'), { recursive: true });
  await writeFile(path.join(projectDir, '.pi', 'codeflow.json'), configText, 'utf8');
  return projectDir;
}

describe('parseFlowCheckArguments', () => {
  it('parses dry-run and failure policy options', () => {
    expect(parseFlowCheckArguments('--dry-run --all')).toEqual({
      dryRun: true,
      continueOnFailure: true,
    });
    expect(parseFlowCheckArguments('--stop-on-failure')).toEqual({
      dryRun: false,
      stopOnFailure: true,
    });
  });

  it('rejects arbitrary command arguments', () => {
    expect(() => parseFlowCheckArguments('gh pr create')).toThrow(CodeflowCheckError);
  });
});

describe('runFlowCheck', () => {
  it('loads config and runs configured checks', async () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      checks: [{ name: 'unit', command: `${node} -e "console.log('ok')"` }],
    } as Record<string, unknown>);
    const calls: unknown[] = [];
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'codeflow-flow-check-cwd-'));
    const result = await runFlowCheck({
      cwd,
      loadConfig: async (options) => {
        calls.push(options);
        return {
          config,
          configPath: path.join(cwd, '.pi', 'codeflow.json'),
          usedDefaultConfig: false,
          validationWarnings: [],
        };
      },
    });

    expect(calls).toEqual([{ cwd }]);
    expect(result.checkRun.status).toBe('passed');
    expect(result.lifecyclePhase).toBe('local_checks');
    expect(result.sessionState.checks.lastRun?.status).toBe('passed');
  });

  it('supports dry-run without executing configured checks', async () => {
    const projectDir = await makeTempProject(
      JSON.stringify({
        checks: [
          {
            name: 'would fail',
            command: `${node} -e "process.exit(1)"`,
          },
        ],
      }),
    );
    const result = await runFlowCheck({ cwd: projectDir, dryRun: true });

    expect(result.checkRun.status).toBe('skipped');
    expect(result.lifecyclePhase).toBe('local_checks');
    expect(result.nextExpectedActions.join('\n')).toContain('without --dry-run');
  });

  it('supports stop-on-failure and continue-on-failure policies', async () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      checks: [
        { name: 'fail', command: `${node} -e "process.exit(1)"` },
        { name: 'pass', command: `${node} -e "console.log('ok')"` },
      ],
    } as Record<string, unknown>);

    const stopped = await runFlowCheck({ config, stopOnFailure: true });
    const continued = await runFlowCheck({ config, continueOnFailure: true });

    expect(stopped.checkRun.results.map((check) => check.status)).toEqual([
      'failed',
      'skipped',
    ]);
    expect(continued.checkRun.results.map((check) => check.status)).toEqual([
      'failed',
      'passed',
    ]);
  });

  it('moves failed checks to fixing_local_findings and stores state', async () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      checks: [
        {
          name: 'test',
          command: `${node} -e "console.error('bad'); process.exit(1)"`,
        },
      ],
    } as Record<string, unknown>);
    const result = await runFlowCheck({ config });

    expect(result.checkRun.status).toBe('failed');
    expect(result.lifecyclePhase).toBe('fixing_local_findings');
    expect(result.sessionState.lifecycle.phase).toBe('fixing_local_findings');
    expect(result.sessionState.checks.lastRun?.status).toBe('failed');
  });

  it('records no-checks without claiming verification', async () => {
    const result = await runFlowCheck({ config: getDefaultCodeflowConfig() });

    expect(result.checkRun.status).toBe('no_checks');
    expect(result.lifecyclePhase).toBe('local_checks');
    expect(result.warnings).toContain('No checks are configured; local verification was not proven.');
    expect(result.nextExpectedActions.join('\n')).toContain('no local checks are configured');
    expect(result.sessionState.lifecycle.phase).not.toBe('verified');
  });
});

describe('/flow-check command registration', () => {
  it('registers the command and returns a clear summary notification', async () => {
    const notifications: Array<{ message: string; level: string }> = [];
    const handlers = new Map<string, (args: string, context: { cwd: string; ui: { notify: (message: string, level: 'info' | 'warning' | 'error') => void } }) => Promise<unknown>>();

    registerCodeflowExtension(
      {
        on() {},
        registerCommand(name, options) {
          handlers.set(name, options.handler);
        },
      },
      {
        runFlowCheck: async (options) =>
          ({
            checkRun: {
              status: 'passed',
              startedAt: '2026-01-01T00:00:00.000Z',
              finishedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 1000,
              results: [],
              summary: 'Codeflow checks passed.',
              failedCheckNames: [],
              passedCheckNames: ['lint'],
              skippedCheckNames: [],
            },
            lifecyclePhase: 'local_checks',
            nextExpectedActions: ['Proceed to self-review when available.'],
            warnings: options?.dryRun ? ['Dry run requested; configured checks were not executed.'] : [],
            sessionState: {
              lifecycle: { phase: 'local_checks', workBranch: null },
              checks: { lastRun: null },
              updatedAt: '2026-01-01T00:00:01.000Z',
            },
          }) satisfies FlowCheckResult,
      },
    );

    const handler = handlers.get('flow-check');
    expect(handler).toBeDefined();
    const result = await handler?.('--dry-run', {
      cwd: '/tmp/project',
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
    });

    expect(result).toBeDefined();
    expect(notifications[0]?.level).toBe('info');
    expect(notifications[0]?.message).toContain('Codeflow check result.');
    expect(notifications[0]?.message).toContain('Status: passed');
    expect(notifications[0]?.message).toContain('Next expected actions:');
  });

  it('surfaces errors without commit, push, PR, or GitHub automation arguments', async () => {
    const notifications: Array<{ message: string; level: string }> = [];
    const handlers = new Map<string, (args: string, context: { cwd: string; ui: { notify: (message: string, level: 'info' | 'warning' | 'error') => void } }) => Promise<unknown>>();

    registerCodeflowExtension({
      on() {},
      registerCommand(name, options) {
        handlers.set(name, options.handler);
      },
    });

    await expect(
      handlers.get('flow-check')?.('gh pr create', {
        cwd: '/tmp/project',
        ui: {
          notify(message, level) {
            notifications.push({ message, level });
          },
        },
      }),
    ).rejects.toThrow(CodeflowCheckError);

    expect(notifications[0]).toEqual({
      level: 'error',
      message: '/flow-check failed: Unknown /flow-check option: gh',
    });
  });
});
