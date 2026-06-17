import path from 'node:path';

import type { CodeflowConfig } from '../config/codeflow-config';
import { loadCodeflowConfig } from '../config/load-config';
import {
  runCodeflowChecks,
  type RunCodeflowChecksOptions,
} from '../checks/check-runner';
import { CodeflowCheckError } from '../checks/check-errors';
import type { CodeflowCheckRunResult } from '../checks/check-result';
import { formatDurationMs } from '../utils/time';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import {
  createCodeflowSessionState,
  updateSessionStateWithCheckRun,
  type CodeflowSessionState,
} from '../state/session-state';

export interface FlowCheckOptions {
  cwd?: string;
  dryRun?: boolean;
  stopOnFailure?: boolean;
  continueOnFailure?: boolean;
  config?: CodeflowConfig;
  loadConfig?: typeof loadCodeflowConfig;
  runChecks?: typeof runCodeflowChecks;
  sessionState?: CodeflowSessionState;
}

export interface FlowCheckResult {
  checkRun: CodeflowCheckRunResult;
  lifecyclePhase: CodeflowLifecyclePhase;
  nextExpectedActions: string[];
  warnings: string[];
  sessionState: CodeflowSessionState;
}

interface ParsedFlowCheckArguments {
  dryRun: boolean;
  stopOnFailure?: boolean;
  continueOnFailure?: boolean;
}

export async function runFlowCheck(
  options: FlowCheckOptions = {},
): Promise<FlowCheckResult> {
  validateFailurePolicyOptions(options.stopOnFailure, options.continueOnFailure);

  const cwd = options.cwd ?? process.cwd();
  const loadConfig = options.loadConfig ?? loadCodeflowConfig;
  const loadedConfig = options.config
    ? {
        config: options.config,
        configPath: null,
        usedDefaultConfig: false,
        validationWarnings: [],
      }
    : await loadConfig({ cwd });
  const config = loadedConfig.config;
  const checkCwd = resolveCheckBaseCwd(cwd, loadedConfig.configPath);
  const stopOnFailure = resolveStopOnFailure(options);
  const runChecks = options.runChecks ?? runCodeflowChecks;
  const warnings = collectFlowCheckWarnings({
    usedDefaultConfig: loadedConfig.usedDefaultConfig,
    dryRun: options.dryRun === true,
    checkCount: config.checks.length,
  });
  const checkRun = await runChecks({
    cwd: checkCwd,
    checks: config.checks,
    stopOnFailure,
    dryRun: options.dryRun,
  } satisfies RunCodeflowChecksOptions);
  const lifecyclePhase = getLifecyclePhaseForCheckRun(checkRun, options.dryRun === true);
  const sessionState = updateSessionStateWithCheckRun(
    options.sessionState ?? createCodeflowSessionState({ phase: 'local_checks' }),
    checkRun,
    lifecyclePhase,
  );

  return {
    checkRun,
    lifecyclePhase,
    nextExpectedActions: getFlowCheckNextExpectedActions(checkRun, options.dryRun === true),
    warnings,
    sessionState,
  };
}

export function parseFlowCheckArguments(args: string): ParsedFlowCheckArguments {
  const tokens = args.trim().length === 0 ? [] : args.trim().split(/\s+/);
  let dryRun = false;
  let stopOnFailure: boolean | undefined;
  let continueOnFailure: boolean | undefined;

  for (const token of tokens) {
    if (token === '--dry-run' || token === '--dryRun') {
      dryRun = true;
      continue;
    }

    if (token === '--all' || token === '--continue-on-failure') {
      continueOnFailure = true;
      continue;
    }

    if (token === '--stop-on-failure') {
      stopOnFailure = true;
      continue;
    }

    throw new CodeflowCheckError({
      code: 'invalid_arguments',
      message: `Unknown /flow-check option: ${token}`,
      details: { option: token },
    });
  }

  validateFailurePolicyOptions(stopOnFailure, continueOnFailure);

  return {
    dryRun,
    ...(stopOnFailure === undefined ? {} : { stopOnFailure }),
    ...(continueOnFailure === undefined ? {} : { continueOnFailure }),
  };
}

export function formatFlowCheckResult(result: FlowCheckResult): string {
  const run = result.checkRun;
  const lines = [
    'Codeflow check result.',
    '',
    `Status: ${run.status}`,
    `Checks run: ${run.results.filter((check) => check.status !== 'skipped').length}`,
    `Passed: ${formatNameList(run.passedCheckNames)}`,
    `Failed: ${formatNameList(run.failedCheckNames)}`,
    `Skipped: ${formatNameList(run.skippedCheckNames)}`,
    `Duration: ${formatDurationMs(run.durationMs)}`,
    `Lifecycle phase: ${result.lifecyclePhase}`,
    '',
    run.summary,
    '',
    'Next expected actions:',
    ...result.nextExpectedActions.map((action) => `- ${action}`),
  ];

  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:', ...result.warnings.map((warning) => `- ${warning}`));
  }

  return lines.join('\n');
}

function resolveCheckBaseCwd(cwd: string, configPath: string | null): string {
  if (configPath === null) {
    return cwd;
  }

  return path.dirname(path.dirname(configPath));
}

function resolveStopOnFailure(options: FlowCheckOptions): boolean {
  if (options.continueOnFailure) {
    return false;
  }

  if (options.stopOnFailure !== undefined) {
    return options.stopOnFailure;
  }

  return true;
}

function validateFailurePolicyOptions(
  stopOnFailure: boolean | undefined,
  continueOnFailure: boolean | undefined,
): void {
  if (stopOnFailure && continueOnFailure) {
    throw new CodeflowCheckError({
      code: 'invalid_arguments',
      message:
        'Choose either --stop-on-failure or --continue-on-failure/--all, not both.',
    });
  }
}

function collectFlowCheckWarnings(options: {
  usedDefaultConfig?: boolean;
  dryRun: boolean;
  checkCount: number;
}): string[] {
  const warnings: string[] = [];

  if (options.usedDefaultConfig) {
    warnings.push('No project Codeflow config was found; package defaults are in use.');
  }

  if (options.checkCount === 0) {
    warnings.push('No checks are configured; local verification was not proven.');
  }

  if (options.dryRun) {
    warnings.push('Dry run requested; configured checks were not executed.');
  }

  return warnings;
}

function getLifecyclePhaseForCheckRun(
  run: CodeflowCheckRunResult,
  dryRun: boolean,
): CodeflowLifecyclePhase {
  if (dryRun) {
    return 'local_checks';
  }

  if (run.status === 'failed') {
    return 'fixing_local_findings';
  }

  return 'local_checks';
}

function getFlowCheckNextExpectedActions(
  run: CodeflowCheckRunResult,
  dryRun: boolean,
): string[] {
  if (dryRun) {
    return [
      'Review the planned configured checks.',
      'Run /flow-check without --dry-run before claiming local verification.',
    ];
  }

  if (run.status === 'no_checks') {
    return [
      'Record that no local checks are configured.',
      'Proceed to self-review only with an explicit no-checks warning.',
    ];
  }

  if (run.status === 'failed') {
    return [
      'Fix the failing local check output without expanding scope.',
      'Run /flow-check again after the fix.',
    ];
  }

  if (run.status === 'skipped') {
    return [
      'Do not claim local verification from skipped checks.',
      'Run /flow-check again when checks can execute.',
    ];
  }

  return [
    'Proceed to self-review when available.',
    'Do not commit, push, open a PR, or run GitHub automation from /flow-check.',
  ];
}

function formatNameList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}
