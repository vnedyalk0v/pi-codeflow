import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CodeflowConfig } from '../config/codeflow-config';
import { loadCodeflowConfig } from '../config/load-config';
import type { GhClientLike } from '../github/gh-client';
import type { GitClient } from '../git/git-client';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import {
  createCodeflowSessionState,
  updateSessionStateWithPullRequest,
  type CodeflowSessionState,
} from '../state/session-state';
import { parseJson } from '../utils/json';
import { createCodeflowPullRequestFromPayload } from '../pull-requests/pr-policy';
import { CodeflowPrError } from '../pull-requests/pr-errors';
import type { CodeflowPrPayload, CodeflowPrResult } from '../pull-requests/pr-payload';

export interface FlowPrOptions {
  cwd?: string;
  payload: CodeflowPrPayload;
  dryRun?: boolean;
  draft?: boolean;
  baseBranch?: string;
  headBranch?: string;
  allowUnverified?: boolean;
  allowReservedHead?: boolean;
  push?: boolean;
  config?: CodeflowConfig;
  loadConfig?: typeof loadCodeflowConfig;
  gitClient?: GitClient;
  ghClient?: GhClientLike;
  sessionState?: CodeflowSessionState;
}

export interface FlowPrResult extends CodeflowPrResult {
  nextExpectedActions: string[];
  sessionState: CodeflowSessionState;
}

export interface ParsedFlowPrArguments {
  dryRun: boolean;
  draft?: boolean;
  allowUnverified: boolean;
  allowReservedHead: boolean;
  push?: boolean;
  payloadPath?: string;
  baseBranch?: string;
  headBranch?: string;
}

export async function runFlowPr(options: FlowPrOptions): Promise<FlowPrResult> {
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
  const sessionState = options.sessionState ?? createCodeflowSessionState({ phase: 'committed' });
  const templateCwd = resolveCommandBaseCwd(cwd, loadedConfig.configPath);
  const pr = await createCodeflowPullRequestFromPayload({
    cwd,
    payload: options.payload,
    dryRun: options.dryRun,
    draft: options.draft,
    baseBranch: options.baseBranch,
    headBranch: options.headBranch,
    allowUnverified: options.allowUnverified,
    allowReservedHead: options.allowReservedHead,
    push: options.push,
    config,
    gitClient: options.gitClient,
    ghClient: options.ghClient,
    sessionState,
    templateCwd,
  });
  const warnings = [...pr.warnings];

  if (loadedConfig.usedDefaultConfig) {
    warnings.push('No project Codeflow config was found; package defaults are in use.');
  }

  const nextSessionState = pr.status === 'created' && pr.prUrl && pr.prNumber !== null
    ? updateSessionStateWithPullRequest(sessionState, {
        number: pr.prNumber,
        url: pr.prUrl,
        baseBranch: pr.baseBranch,
        headBranch: pr.headBranch,
        title: pr.title,
        draft: pr.draft,
      })
    : sessionState;

  return {
    ...pr,
    warnings,
    nextExpectedActions: getFlowPrNextExpectedActions(pr.lifecyclePhase, pr.status),
    sessionState: nextSessionState,
  };
}

export function parseFlowPrArguments(args: string): ParsedFlowPrArguments {
  const tokens = splitCommandArguments(args);
  let dryRun = false;
  let draft: boolean | undefined;
  let allowUnverified = false;
  let allowReservedHead = false;
  let push: boolean | undefined;
  let payloadPath: string | undefined;
  let baseBranch: string | undefined;
  let headBranch: string | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '--dry-run' || token === '--dryRun') {
      dryRun = true;
      continue;
    }

    if (token === '--draft') {
      draft = true;
      continue;
    }

    if (token === '--ready') {
      draft = false;
      continue;
    }

    if (token === '--allow-unverified') {
      allowUnverified = true;
      continue;
    }

    if (token === '--allow-reserved-head') {
      allowReservedHead = true;
      continue;
    }

    if (token === '--push') {
      push = true;
      continue;
    }

    if (token === '--no-push') {
      push = false;
      continue;
    }

    if (token === '--payload') {
      payloadPath = readFlagValue(tokens, index, '--payload');
      index += 1;
      continue;
    }

    if (token.startsWith('--payload=')) {
      payloadPath = token.slice('--payload='.length);
      continue;
    }

    if (token === '--base') {
      baseBranch = readFlagValue(tokens, index, '--base');
      index += 1;
      continue;
    }

    if (token.startsWith('--base=')) {
      baseBranch = token.slice('--base='.length);
      continue;
    }

    if (token === '--head') {
      headBranch = readFlagValue(tokens, index, '--head');
      index += 1;
      continue;
    }

    if (token.startsWith('--head=')) {
      headBranch = token.slice('--head='.length);
      continue;
    }

    if (token.startsWith('--')) {
      throw new CodeflowPrError({
        code: 'invalid_arguments',
        message: `Unknown /flow-pr option: ${token}`,
        details: { option: token },
      });
    }

    throw new CodeflowPrError({
      code: 'invalid_arguments',
      message: `/flow-pr only accepts flags; unexpected argument: ${token}`,
      details: { argument: token },
    });
  }

  return {
    dryRun,
    allowUnverified,
    allowReservedHead,
    ...(draft === undefined ? {} : { draft }),
    ...(push === undefined ? {} : { push }),
    ...(payloadPath === undefined ? {} : { payloadPath }),
    ...(baseBranch === undefined ? {} : { baseBranch }),
    ...(headBranch === undefined ? {} : { headBranch }),
  };
}

export async function readFlowPrPayloadFile(
  payloadPath: string,
  cwd = process.cwd(),
): Promise<CodeflowPrPayload> {
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

    throw new CodeflowPrError({
      code,
      message: `PR payload file could not be read: ${resolvedPath}`,
      details: { payloadPath: resolvedPath },
      cause: error,
    });
  }

  try {
    return parseJson(text) as CodeflowPrPayload;
  } catch (error) {
    throw new CodeflowPrError({
      code: 'invalid_payload_json',
      message: `PR payload file contains invalid JSON: ${resolvedPath}`,
      details: { payloadPath: resolvedPath },
      cause: error,
    });
  }
}

export function formatFlowPrResult(result: FlowPrResult): string {
  const lines = [
    result.status === 'dry_run' ? 'Codeflow PR dry-run.' : 'Codeflow PR ready.',
    '',
    `Status: ${result.status}`,
    `PR: ${result.prUrl ?? 'not created'}`,
    `Base branch: ${result.baseBranch}`,
    `Head branch: ${result.headBranch}`,
    `Draft: ${result.draft ? 'yes' : 'no'}`,
    `Title: ${result.title}`,
    `Lifecycle phase: ${result.lifecyclePhase}`,
    '',
    'Rendered PR body:',
    '```',
    result.body,
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

function resolveCommandBaseCwd(cwd: string, configPath: string | null): string {
  if (configPath === null) {
    return cwd;
  }

  return path.dirname(path.dirname(configPath));
}

function getFlowPrNextExpectedActions(
  phase: CodeflowLifecyclePhase,
  status: CodeflowPrResult['status'],
): string[] {
  if (status === 'dry_run') {
    return [
      'Review the rendered PR title and body preview.',
      'Run /flow-pr without --dry-run when the branch and payload are ready.',
    ];
  }

  if (phase === 'pr_opened') {
    return [
      'Watch CI and reviewer activity with a future /flow-watch or manual GitHub review.',
      'Do not merge, approve, resolve comments, or delete branches from /flow-pr.',
    ];
  }

  return ['Resolve the PR blocker, then rerun /flow-pr.'];
}

function readFlagValue(tokens: string[], index: number, flagName: string): string {
  const value = tokens[index + 1];

  if (!value || value.startsWith('--')) {
    throw new CodeflowPrError({
      code: 'invalid_arguments',
      message: `${flagName} requires a value.`,
      details: { flagName },
    });
  }

  return value;
}

function splitCommandArguments(args: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const character of args) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (escaping) {
    current += '\\';
  }

  if (quote) {
    throw new CodeflowPrError({
      code: 'invalid_arguments',
      message: 'Unterminated quote in /flow-pr arguments.',
    });
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
