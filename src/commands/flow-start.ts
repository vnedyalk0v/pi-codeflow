import type { CodeflowConfig } from '../config/codeflow-config';
import { loadCodeflowConfig } from '../config/load-config';
import { extractTicketFromTask, renderBranchName } from '../branching/branch-name';
import { inferBranchType } from '../branching/infer-branch-type';
import type { BranchType } from '../branching/branch-type';
import { loadBranchTemplatePattern } from '../branching/branch-template';
import { GitClient } from '../git/git-client';
import { GitError } from '../git/git-errors';
import { createInitialLifecycleState } from '../lifecycle/lifecycle-state';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import { getNextExpectedActions } from '../lifecycle/lifecycle-transitions';
import { assertWorkBranchIsNotReserved } from '../safety/workflow-safety';
import { isReservedBranch } from '../safety/reserved-branch-policy';
import {
  readFlagValue,
  splitCommandArguments,
} from './command-args';

export interface FlowStartOptions {
  cwd?: string;
  task: string;
  type?: BranchType | string;
  ticket?: string | null;
  emergency?: boolean;
  dryRun?: boolean;
  config?: CodeflowConfig;
  gitClient?: GitClient;
  loadConfig?: typeof loadCodeflowConfig;
}

export interface FlowStartResult {
  task: string;
  type: BranchType;
  ticket: string | null;
  baseBranch: string;
  workBranch: string;
  startedFromBranch: string | null;
  currentPhase: CodeflowLifecyclePhase;
  nextExpectedActions: string[];
  dryRun: boolean;
  createdBranch: boolean;
  switchedBranch: boolean;
  warnings: string[];
}

export type FlowStartErrorCode =
  | 'empty_task'
  | 'invalid_arguments'
  | 'unsupported_emergency'
  | 'dirty_working_tree'
  | 'missing_base_branch'
  | 'reserved_work_branch'
  | 'work_branch_exists'
  | 'git_failed';

export interface FlowStartErrorOptions {
  code: FlowStartErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class FlowStartError extends Error {
  readonly code: FlowStartErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(options: FlowStartErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'FlowStartError';
    this.code = options.code;
    this.details = options.details;
  }
}

export interface PrepareCodeflowBranchOptions {
  cwd?: string;
  config: CodeflowConfig;
  workBranch: string;
  dryRun?: boolean;
  gitClient?: GitClient;
}

export interface PrepareCodeflowBranchResult {
  baseBranch: string;
  baseRef: string;
  startedFromBranch: string | null;
  createdBranch: boolean;
  switchedBranch: boolean;
  warnings: string[];
}

interface BaseBranchResolution {
  baseBranch: string;
  baseRef: string;
  warnings: string[];
}

interface ParsedFlowStartArguments {
  task: string;
  type?: string;
  ticket?: string;
  emergency: boolean;
  dryRun: boolean;
}

export async function runFlowStart(
  options: FlowStartOptions,
): Promise<FlowStartResult> {
  const cwd = options.cwd ?? process.cwd();
  const task = normalizeTaskOption(options.task);
  const loadConfig = options.loadConfig ?? loadCodeflowConfig;
  const loadedConfig = options.config
    ? { config: options.config, configPath: null, usedDefaultConfig: false }
    : await loadConfig({ cwd });
  const config = loadedConfig.config;
  const gitClient = options.gitClient ?? new GitClient({ cwd });
  const repoRoot = await getRepoRoot(gitClient);
  const warnings = collectInitialWarnings(loadedConfig.usedDefaultConfig);

  validateEmergencyOptions(options, config, warnings);

  const branchType = inferBranchType({
    task,
    config,
    type: options.type,
    emergency: options.emergency,
  });
  const ticket = options.ticket?.trim() || extractTicketFromTask(task, config);
  const templatePattern = await loadBranchTemplatePattern(config, repoRoot);
  const workBranch = await renderBranchName({
    type: branchType,
    task,
    config,
    ticket,
    templatePattern,
    branchExists: async (candidate) =>
      (await gitClient.branchExists(candidate)) ||
      (await gitClient.remoteBranchExists(candidate)) ||
      (await gitClient.remoteHeadExists(candidate)),
  });
  const prepared = await prepareCodeflowBranch({
    cwd,
    config,
    workBranch,
    dryRun: options.dryRun,
    gitClient,
  });

  warnings.push(...prepared.warnings);

  const lifecycleState = createInitialLifecycleState({
    phase: 'branch_prepared',
    task,
    baseBranch: prepared.baseBranch,
    workBranch,
  });

  return {
    task,
    type: branchType,
    ticket,
    baseBranch: prepared.baseBranch,
    workBranch,
    startedFromBranch: prepared.startedFromBranch,
    currentPhase: lifecycleState.phase,
    nextExpectedActions: getNextExpectedActions(lifecycleState, config),
    dryRun: options.dryRun === true,
    createdBranch: prepared.createdBranch,
    switchedBranch: prepared.switchedBranch,
    warnings,
  };
}

export async function prepareCodeflowBranch(
  options: PrepareCodeflowBranchOptions,
): Promise<PrepareCodeflowBranchResult> {
  const gitClient = options.gitClient ?? new GitClient({ cwd: options.cwd });
  const warnings: string[] = [];
  const startedFromBranch = await getCurrentBranch(gitClient);

  if (isReservedBranch(options.workBranch, options.config)) {
    throw new FlowStartError({
      code: 'reserved_work_branch',
      message: `Rendered work branch ${options.workBranch} is reserved and cannot be used for normal Codeflow work.`,
      details: { workBranch: options.workBranch },
    });
  }

  assertWorkBranchIsNotReserved(options.workBranch, options.config);

  const status = await gitClient.getStatus();

  if (!status.clean) {
    if (options.config.safety.requireCleanWorkingTreeForStart) {
      throw new FlowStartError({
        code: 'dirty_working_tree',
        message:
          'Working tree has uncommitted changes. Commit, stash, or revert them before running /flow-start; Codeflow will not discard or auto-stash changes.',
        details: {
          entries: status.entries,
        },
      });
    }

    warnings.push(
      'Working tree has uncommitted changes; starting anyway because safety.requireCleanWorkingTreeForStart is disabled. Codeflow will not stash, revert, or commit them; if branch checkout succeeds, compatible dirty changes remain in the working tree on the new branch and may be included in this flow.',
    );
  }

  const base = await resolveBaseBranchRef(gitClient, options.config, options.dryRun === true);
  warnings.push(...base.warnings);

  if (await gitClient.branchExists(options.workBranch)) {
    throw new FlowStartError({
      code: 'work_branch_exists',
      message: `Work branch already exists: ${options.workBranch}. Re-run with a different task description or resolve the branch collision.`,
      details: { workBranch: options.workBranch },
    });
  }

  if (options.dryRun) {
    return {
      baseBranch: base.baseBranch,
      baseRef: base.baseRef,
      startedFromBranch,
      createdBranch: false,
      switchedBranch: false,
      warnings,
    };
  }

  await gitClient.checkoutNewBranchFromRef(options.workBranch, base.baseRef);

  return {
    baseBranch: base.baseBranch,
    baseRef: base.baseRef,
    startedFromBranch,
    createdBranch: true,
    switchedBranch: true,
    warnings,
  };
}

export function parseFlowStartArguments(args: string): ParsedFlowStartArguments {
  const tokens = splitCommandArguments(args, '/flow-start', invalidFlowStartArguments);
  const taskTokens: string[] = [];
  let type: string | undefined;
  let ticket: string | undefined;
  let emergency = false;
  let dryRun = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '--emergency') {
      emergency = true;
      continue;
    }

    if (token === '--dry-run' || token === '--dryRun') {
      dryRun = true;
      continue;
    }

    if (token === '--type') {
      type = readFlagValue(tokens, index, '--type', invalidFlowStartArguments);
      index += 1;
      continue;
    }

    if (token.startsWith('--type=')) {
      type = token.slice('--type='.length);
      continue;
    }

    if (token === '--ticket') {
      ticket = readFlagValue(tokens, index, '--ticket', invalidFlowStartArguments);
      index += 1;
      continue;
    }

    if (token.startsWith('--ticket=')) {
      ticket = token.slice('--ticket='.length);
      continue;
    }

    if (token.startsWith('--')) {
      throw new FlowStartError({
        code: 'invalid_arguments',
        message: `Unknown /flow-start option: ${token}`,
        details: { option: token },
      });
    }

    taskTokens.push(token);
  }

  return {
    task: normalizeTaskOption(taskTokens.join(' ')),
    ...(type === undefined ? {} : { type }),
    ...(ticket === undefined ? {} : { ticket }),
    emergency,
    dryRun,
  };
}

export function formatFlowStartResult(result: FlowStartResult): string {
  const lines = [
    'Codeflow task started.',
    '',
    `Task: ${result.task}`,
    `Type: ${result.type}`,
    `Ticket: ${result.ticket ?? 'none'}`,
    `Base branch: ${result.baseBranch}`,
    `Work branch: ${result.workBranch}`,
    `Started from: ${result.startedFromBranch ?? 'detached HEAD'}`,
    `Lifecycle phase: ${result.currentPhase}`,
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    '',
    'Next expected actions:',
    ...result.nextExpectedActions.map((action) => `- ${action}`),
  ];

  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:', ...result.warnings.map((warning) => `- ${warning}`));
  }

  return lines.join('\n');
}

async function resolveBaseBranchRef(
  gitClient: GitClient,
  config: CodeflowConfig,
  dryRun: boolean,
): Promise<BaseBranchResolution> {
  const warnings: string[] = [];
  const defaultBranch = config.baseBranches.default;

  if (!dryRun) {
    const fetched = await gitClient.fetchBranch(defaultBranch);

    if (!fetched) {
      warnings.push(`Could not fetch origin/${defaultBranch}; using available local refs.`);
    }
  }

  const defaultRef = await findBranchRef(gitClient, defaultBranch);

  if (defaultRef) {
    return {
      baseBranch: defaultBranch,
      baseRef: defaultRef,
      warnings,
    };
  }

  if (config.baseBranches.missingDefaultBehavior !== 'fallback') {
    throw missingBaseBranchError(defaultBranch, warnings);
  }

  const fallbackBranch = config.baseBranches.fallback;

  if (!fallbackBranch) {
    throw new FlowStartError({
      code: 'missing_base_branch',
      message:
        'Default base branch is missing and baseBranches.fallback is not configured.',
      details: { defaultBranch },
    });
  }

  if (!dryRun) {
    const fetched = await gitClient.fetchBranch(fallbackBranch);

    if (!fetched) {
      warnings.push(`Could not fetch origin/${fallbackBranch}; using available local refs.`);
    }
  }

  const fallbackRef = await findBranchRef(gitClient, fallbackBranch);

  if (!fallbackRef) {
    throw new FlowStartError({
      code: 'missing_base_branch',
      message: `Default base branch ${defaultBranch} is missing and fallback branch ${fallbackBranch} is also unavailable.`,
      details: { defaultBranch, fallbackBranch, warnings },
    });
  }

  warnings.push(`Default base branch ${defaultBranch} was missing; using fallback ${fallbackBranch}.`);

  return {
    baseBranch: fallbackBranch,
    baseRef: fallbackRef,
    warnings,
  };
}

async function findBranchRef(
  gitClient: GitClient,
  branchName: string,
): Promise<string | null> {
  if (await gitClient.remoteBranchExists(branchName)) {
    return `origin/${branchName}`;
  }

  if (await gitClient.branchExists(branchName)) {
    return branchName;
  }

  return null;
}

function missingBaseBranchError(branchName: string, warnings: string[]): FlowStartError {
  return new FlowStartError({
    code: 'missing_base_branch',
    message: `Configured base branch ${branchName} was not found locally or as origin/${branchName}.`,
    details: { branchName, warnings },
  });
}

function normalizeTaskOption(task: string): string {
  const normalized = task.trim().replace(/\s+/g, ' ');

  if (normalized.length === 0) {
    throw new FlowStartError({
      code: 'empty_task',
      message: '/flow-start requires a task description.',
    });
  }

  return normalized;
}

function validateEmergencyOptions(
  options: FlowStartOptions,
  config: CodeflowConfig,
  warnings: string[],
): void {
  if (!options.emergency) {
    return;
  }

  if (!config.emergency.enabled || config.emergency.defaultPath !== 'hotfix_branch') {
    throw new FlowStartError({
      code: 'unsupported_emergency',
      message:
        'Emergency /flow-start is only supported when emergency.defaultPath is hotfix_branch.',
      details: {
        enabled: config.emergency.enabled,
        defaultPath: config.emergency.defaultPath,
      },
    });
  }

  if (options.type && options.type !== 'hotfix') {
    warnings.push(
      `Emergency flag was provided with explicit branch type ${options.type}; explicit branch type was honored.`,
    );
  }
}

function collectInitialWarnings(usedDefaultConfig: boolean | undefined): string[] {
  return usedDefaultConfig ? ['No project Codeflow config was found; package defaults are in use.'] : [];
}

async function getRepoRoot(gitClient: GitClient): Promise<string> {
  try {
    return await gitClient.getRepoRoot();
  } catch (error) {
    if (error instanceof GitError) {
      throw new FlowStartError({
        code: 'git_failed',
        message: `Could not determine git repository root: ${error.message}`,
        cause: error,
      });
    }

    throw error;
  }
}

async function getCurrentBranch(gitClient: GitClient): Promise<string | null> {
  try {
    return await gitClient.getCurrentBranch();
  } catch (error) {
    if (error instanceof GitError) {
      throw new FlowStartError({
        code: 'git_failed',
        message: `Could not determine current git branch: ${error.message}`,
        cause: error,
      });
    }

    throw error;
  }
}

function invalidFlowStartArguments(message: string, details?: Record<string, unknown>): FlowStartError {
  return new FlowStartError({
    code: 'invalid_arguments',
    message,
    details,
  });
}
