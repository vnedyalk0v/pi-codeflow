import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CodeflowConfig } from '../config/codeflow-config';
import { loadCodeflowConfig } from '../config/load-config';
import { createGitCommitFromPayload } from '../commits/commit-policy';
import { CodeflowCommitError } from '../commits/commit-errors';
import type {
  CodeflowCommitPayload,
  CodeflowCommitResult,
} from '../commits/commit-payload';
import type { GitClient } from '../git/git-client';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import {
  createCodeflowSessionState,
  updateSessionStateWithCommit,
  type CodeflowSessionState,
} from '../state/session-state';
import { parseJson } from '../utils/json';
import {
  readFlagValue,
  resolveCommandBaseCwd,
  splitCommandArguments,
} from './command-args';

export interface FlowCommitOptions {
  cwd?: string;
  payload: CodeflowCommitPayload;
  dryRun?: boolean;
  allowUnverified?: boolean;
  allowReservedBranch?: boolean;
  config?: CodeflowConfig;
  loadConfig?: typeof loadCodeflowConfig;
  gitClient?: GitClient;
  sessionState?: CodeflowSessionState;
}

export interface FlowCommitResult extends CodeflowCommitResult {
  nextExpectedActions: string[];
  sessionState: CodeflowSessionState;
}

export interface ParsedFlowCommitArguments {
  dryRun: boolean;
  allowUnverified: boolean;
  allowReservedBranch: boolean;
  payloadPath?: string;
}

export async function runFlowCommit(
  options: FlowCommitOptions,
): Promise<FlowCommitResult> {
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
  const sessionState = options.sessionState ?? createCodeflowSessionState({ phase: 'ready_to_commit' });
  const templateCwd = resolveCommandBaseCwd(cwd, loadedConfig.configPath);
  const commit = await createGitCommitFromPayload({
    cwd,
    payload: options.payload,
    dryRun: options.dryRun,
    allowUnverified: options.allowUnverified,
    allowReservedBranch: options.allowReservedBranch,
    config,
    gitClient: options.gitClient,
    sessionState,
    templateCwd,
  });
  const warnings = [...commit.warnings];

  if (loadedConfig.usedDefaultConfig) {
    warnings.push('No project Codeflow config was found; package defaults are in use.');
  }

  const nextSessionState = commit.status === 'committed' && commit.commitSha
    ? updateSessionStateWithCommit(sessionState, {
        sha: commit.commitSha,
        branch: commit.branch,
        title: commit.title,
        payload: commit.payload,
      })
    : sessionState;

  return {
    ...commit,
    warnings,
    nextExpectedActions: getFlowCommitNextExpectedActions(commit.lifecyclePhase, commit.status),
    sessionState: nextSessionState,
  };
}

export function parseFlowCommitArguments(args: string): ParsedFlowCommitArguments {
  const tokens = splitCommandArguments(args, '/flow-commit', invalidFlowCommitArguments);
  let dryRun = false;
  let allowUnverified = false;
  let allowReservedBranch = false;
  let payloadPath: string | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '--dry-run' || token === '--dryRun') {
      dryRun = true;
      continue;
    }

    if (token === '--allow-unverified') {
      allowUnverified = true;
      continue;
    }

    if (token === '--allow-reserved-branch') {
      allowReservedBranch = true;
      continue;
    }

    if (token === '--payload') {
      payloadPath = readFlagValue(tokens, index, '--payload', invalidFlowCommitArguments);
      index += 1;
      continue;
    }

    if (token.startsWith('--payload=')) {
      payloadPath = token.slice('--payload='.length);
      continue;
    }

    if (token.startsWith('--')) {
      throw new CodeflowCommitError({
        code: 'invalid_arguments',
        message: `Unknown /flow-commit option: ${token}`,
        details: { option: token },
      });
    }

    throw new CodeflowCommitError({
      code: 'invalid_arguments',
      message: `/flow-commit only accepts flags; unexpected argument: ${token}`,
      details: { argument: token },
    });
  }

  return {
    dryRun,
    allowUnverified,
    allowReservedBranch,
    ...(payloadPath === undefined ? {} : { payloadPath }),
  };
}

export async function readFlowCommitPayloadFile(
  payloadPath: string,
  cwd = process.cwd(),
): Promise<CodeflowCommitPayload> {
  const resolvedPath = path.isAbsolute(payloadPath)
    ? payloadPath
    : path.resolve(cwd, payloadPath);
  let text: string;

  try {
    text = await readFile(resolvedPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? 'payload_file_not_found'
      : 'payload_file_unreadable';

    throw new CodeflowCommitError({
      code,
      message: `Commit payload file could not be read: ${resolvedPath}`,
      details: { payloadPath: resolvedPath },
      cause: error,
    });
  }

  try {
    return parseJson(text) as CodeflowCommitPayload;
  } catch (error) {
    throw new CodeflowCommitError({
      code: 'invalid_payload_json',
      message: `Commit payload file contains invalid JSON: ${resolvedPath}`,
      details: { payloadPath: resolvedPath },
      cause: error,
    });
  }
}

export function formatFlowCommitResult(result: FlowCommitResult): string {
  const lines = [
    result.status === 'dry_run' ? 'Codeflow commit dry-run.' : 'Codeflow commit created.',
    '',
    `Status: ${result.status}`,
    `Branch: ${result.branch ?? 'detached HEAD'}`,
    `Commit: ${result.commitSha ?? 'not created'}`,
    `Title: ${result.title}`,
    `Lifecycle phase: ${result.lifecyclePhase}`,
    '',
    'Rendered commit message:',
    '```',
    result.message,
    '```',
    '',
    'Next expected actions:',
    ...result.nextExpectedActions.map((action) => `- ${action}`),
  ];

  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:', ...result.warnings.map((warning) => `- ${warning}`));
  }

  return lines.join('\n');
}

function getFlowCommitNextExpectedActions(
  phase: CodeflowLifecyclePhase,
  status: CodeflowCommitResult['status'],
): string[] {
  if (status === 'dry_run') {
    return [
      'Review the rendered commit preview.',
      'Run /flow-commit without --dry-run when the staged diff and payload are ready.',
    ];
  }

  if (phase === 'committed') {
    return [
      'Prepare a structured PR payload and use /flow-pr for PR creation.',
      'Do not push, open a PR, watch GitHub checks, or merge from /flow-commit.',
    ];
  }

  return ['Resolve the commit blocker, then rerun /flow-commit.'];
}

function invalidFlowCommitArguments(message: string, details?: Record<string, unknown>): CodeflowCommitError {
  return new CodeflowCommitError({
    code: 'invalid_arguments',
    message,
    details,
  });
}
