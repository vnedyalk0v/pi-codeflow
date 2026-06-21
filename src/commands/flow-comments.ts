import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CodeflowConfig } from '../config/codeflow-config';
import { loadCodeflowConfig } from '../config/load-config';
import type { GhClientLike } from '../github/gh-client';
import { listGitHubReviewThreads } from '../github/pr-review-threads-client';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import { filterReviewThreads } from '../review-comments/review-thread-filters';
import { CodeflowReviewCommentsError } from '../review-comments/review-comments-errors';
import type { CodeflowReviewThread } from '../review-comments/review-thread';
import type {
  CodeflowReviewCommentTriage,
  CodeflowReviewCommentTriageResult,
} from '../review-comments/review-thread-triage';
import { validateReviewCommentTriage } from '../review-comments/review-thread-triage-validation';
import { summarizeReviewThreads } from '../review-comments/review-thread-summary';
import {
  createCodeflowSessionState,
  updateSessionStateWithReviewComments,
  type CodeflowSessionState,
} from '../state/session-state';
import { parseJson } from '../utils/json';

export interface FlowCommentsOptions {
  cwd?: string;
  pr?: number | string;
  unresolvedOnly?: boolean;
  includeOutdated?: boolean;
  includeResolved?: boolean;
  authors?: string[];
  paths?: string[];
  maxThreads?: number;
  triagePayloadPath?: string;
  triagePayload?: unknown;
  dryRun?: boolean;
  json?: boolean;
  config?: CodeflowConfig;
  loadConfig?: typeof loadCodeflowConfig;
  ghClient?: GhClientLike;
  sessionState?: CodeflowSessionState;
}

export interface FlowCommentsResult {
  status: 'found' | 'none' | 'dry_run' | 'failed';
  prNumber: number | null;
  prUrl: string | null;
  threads: CodeflowReviewThread[];
  filteredThreads: CodeflowReviewThread[];
  triage: CodeflowReviewCommentTriageResult | null;
  summary: string;
  warnings: string[];
  lifecyclePhase: CodeflowLifecyclePhase;
  nextExpectedActions: string[];
  sessionState: CodeflowSessionState;
  incomplete: boolean;
  json: boolean;
}

export interface ParsedFlowCommentsArguments {
  dryRun: boolean;
  json: boolean;
  pr?: number;
  unresolvedOnly?: boolean;
  includeResolved?: boolean;
  includeOutdated?: boolean;
  authors?: string[];
  paths?: string[];
  maxThreads?: number;
  triagePayloadPath?: string;
}

export async function runFlowComments(
  options: FlowCommentsOptions = {},
): Promise<FlowCommentsResult> {
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
  const sessionState = options.sessionState ?? createCodeflowSessionState({ phase: 'pr_opened' });
  const warnings: string[] = [];

  if (loadedConfig.usedDefaultConfig) {
    warnings.push('No project Codeflow config was found; package defaults are in use.');
  }

  if (options.dryRun) {
    return makeDryRunResult({ options, config, sessionState, warnings });
  }

  if (!config.reviewComments.enabled) {
    throw new CodeflowReviewCommentsError({
      code: 'review_comments_disabled',
      message: 'Codeflow review comments are disabled by reviewComments.enabled.',
    });
  }

  const maxThreads = resolveMaxThreads(options.maxThreads ?? config.reviewComments.maxThreadsPerRun);
  const unresolvedOnly = resolveUnresolvedOnly(options, config);
  const includeOutdated = options.includeOutdated ?? config.reviewComments.includeOutdated;
  const targetPr = resolveTargetPrOption(options.pr, sessionState);
  const listed = await listGitHubReviewThreads({
    cwd,
    pr: targetPr,
    maxThreads,
    ghClient: options.ghClient,
  });
  warnings.push(...listed.warnings);

  const filteredThreads = filterReviewThreads(listed.threads, {
    unresolvedOnly,
    includeResolved: unresolvedOnly === false,
    includeOutdated,
    authors: options.authors,
    includeAuthors: options.authors === undefined ? config.reviewComments.includeAuthors : [],
    excludeAuthors: config.reviewComments.excludeAuthors,
    paths: options.paths,
    maxThreads,
  });
  const triage = await loadAndValidateTriagePayload(options, cwd, filteredThreads);
  const status: FlowCommentsResult['status'] = getFlowCommentsStatus({
    filteredThreadCount: filteredThreads.length,
    incomplete: listed.incomplete,
  });
  const lifecyclePhase = getLifecyclePhaseForComments({
    status,
    triage,
    sessionState,
  });
  const summary = summarizeReviewThreads({
    prNumber: listed.prNumber,
    prUrl: listed.prUrl,
    threads: listed.threads,
    filteredThreads,
    unresolvedOnly,
    includeOutdated,
    scanIncomplete: listed.incomplete,
    triage,
  });
  const nextExpectedActions = getFlowCommentsNextExpectedActions({
    status,
    triage,
    filteredThreadCount: filteredThreads.length,
    incomplete: listed.incomplete,
  });
  const nextSessionState = updateSessionStateWithReviewComments(sessionState, {
    status,
    prNumber: listed.prNumber,
    prUrl: listed.prUrl,
    unresolvedOnly,
    includeOutdated,
    fetchedThreadCount: listed.threads.length,
    filteredThreadCount: filteredThreads.length,
    threads: filteredThreads,
    triage,
    summary,
  }, lifecyclePhase);

  return {
    status,
    prNumber: listed.prNumber,
    prUrl: listed.prUrl,
    threads: listed.threads,
    filteredThreads,
    triage,
    summary,
    warnings,
    lifecyclePhase,
    nextExpectedActions,
    sessionState: nextSessionState,
    incomplete: listed.incomplete,
    json: options.json === true,
  };
}

export function parseFlowCommentsArguments(args: string): ParsedFlowCommentsArguments {
  const tokens = splitCommandArguments(args);
  let dryRun = false;
  let json = false;
  let pr: number | undefined;
  let unresolvedOnly: boolean | undefined;
  let includeResolved: boolean | undefined;
  let includeOutdated: boolean | undefined;
  let maxThreads: number | undefined;
  let triagePayloadPath: string | undefined;
  const authors: string[] = [];
  const paths: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '--dry-run' || token === '--dryRun') {
      dryRun = true;
      continue;
    }

    if (token === '--json') {
      json = true;
      continue;
    }

    if (token === '--all') {
      validateThreadMode(unresolvedOnly, false, token);
      unresolvedOnly = false;
      includeResolved = true;
      continue;
    }

    if (token === '--unresolved') {
      validateThreadMode(unresolvedOnly, true, token);
      unresolvedOnly = true;
      includeResolved = false;
      continue;
    }

    if (token === '--include-outdated') {
      includeOutdated = true;
      continue;
    }

    if (token === '--pr') {
      pr = parsePositiveInteger(readFlagValue(tokens, index, '--pr'), '--pr');
      index += 1;
      continue;
    }

    if (token.startsWith('--pr=')) {
      pr = parsePositiveInteger(token.slice('--pr='.length), '--pr');
      continue;
    }

    if (token === '--author') {
      authors.push(readFlagValue(tokens, index, '--author'));
      index += 1;
      continue;
    }

    if (token.startsWith('--author=')) {
      authors.push(token.slice('--author='.length));
      continue;
    }

    if (token === '--path') {
      paths.push(readFlagValue(tokens, index, '--path'));
      index += 1;
      continue;
    }

    if (token.startsWith('--path=')) {
      paths.push(token.slice('--path='.length));
      continue;
    }

    if (token === '--max-threads') {
      maxThreads = parsePositiveInteger(readFlagValue(tokens, index, '--max-threads'), '--max-threads');
      index += 1;
      continue;
    }

    if (token.startsWith('--max-threads=')) {
      maxThreads = parsePositiveInteger(token.slice('--max-threads='.length), '--max-threads');
      continue;
    }

    if (token === '--triage-payload') {
      triagePayloadPath = readFlagValue(tokens, index, '--triage-payload');
      index += 1;
      continue;
    }

    if (token.startsWith('--triage-payload=')) {
      triagePayloadPath = token.slice('--triage-payload='.length);
      continue;
    }

    if (token.startsWith('--')) {
      throw new CodeflowReviewCommentsError({
        code: 'invalid_arguments',
        message: `Unknown /flow-comments option: ${token}`,
        details: { option: token },
      });
    }

    throw new CodeflowReviewCommentsError({
      code: 'invalid_arguments',
      message: `/flow-comments only accepts flags; unexpected argument: ${token}`,
      details: { argument: token },
    });
  }

  return {
    dryRun,
    json,
    ...(pr === undefined ? {} : { pr }),
    ...(unresolvedOnly === undefined ? {} : { unresolvedOnly }),
    ...(includeResolved === undefined ? {} : { includeResolved }),
    ...(includeOutdated === undefined ? {} : { includeOutdated }),
    ...(authors.length === 0 ? {} : { authors }),
    ...(paths.length === 0 ? {} : { paths }),
    ...(maxThreads === undefined ? {} : { maxThreads }),
    ...(triagePayloadPath === undefined ? {} : { triagePayloadPath }),
  };
}

export function formatFlowCommentsResult(result: FlowCommentsResult): string {
  if (result.json) {
    return JSON.stringify(result, null, 2);
  }

  return result.summary;
}

async function loadAndValidateTriagePayload(
  options: FlowCommentsOptions,
  cwd: string,
  threads: CodeflowReviewThread[],
): Promise<CodeflowReviewCommentTriageResult | null> {
  if (options.triagePayload === undefined && !options.triagePayloadPath) {
    return null;
  }

  const payload = options.triagePayload ?? await readReviewCommentTriagePayloadFile(options.triagePayloadPath!, cwd);
  const result = validateReviewCommentTriage(payload, {
    fetchedThreads: threads,
    requireThreadMatch: true,
    requireAllThreadIds: true,
  });

  if (!result.valid) {
    throw new CodeflowReviewCommentsError({
      code: 'invalid_triage_payload',
      message: 'Review comment triage payload failed validation.',
      details: {
        errors: result.errors,
      },
    });
  }

  return result;
}

export async function readReviewCommentTriagePayloadFile(
  payloadPath: string,
  cwd = process.cwd(),
): Promise<CodeflowReviewCommentTriage> {
  const resolvedPath = path.isAbsolute(payloadPath)
    ? payloadPath
    : path.resolve(cwd, payloadPath);
  let text: string;

  try {
    text = await readFile(resolvedPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? 'triage_payload_file_not_found'
      : 'triage_payload_file_unreadable';

    throw new CodeflowReviewCommentsError({
      code,
      message: `Review comment triage payload file could not be read: ${resolvedPath}`,
      details: { payloadPath: resolvedPath },
      cause: error,
    });
  }

  try {
    return parseJson(text) as CodeflowReviewCommentTriage;
  } catch (error) {
    throw new CodeflowReviewCommentsError({
      code: 'invalid_triage_payload_json',
      message: `Review comment triage payload file contains invalid JSON: ${resolvedPath}`,
      details: { payloadPath: resolvedPath },
      cause: error,
    });
  }
}

function makeDryRunResult(options: {
  options: FlowCommentsOptions;
  config: CodeflowConfig;
  sessionState: CodeflowSessionState;
  warnings: string[];
}): FlowCommentsResult {
  const prNumber = parseOptionalPrNumber(resolveTargetPrOption(options.options.pr, options.sessionState));
  const prUrl = prNumber !== null && options.sessionState.pullRequests.lastPullRequest?.number === prNumber
    ? options.sessionState.pullRequests.lastPullRequest.url
    : null;
  const unresolvedOnly = resolveUnresolvedOnly(options.options, options.config);
  const includeOutdated = options.options.includeOutdated ?? options.config.reviewComments.includeOutdated;
  const summary = [
    'Codeflow review comments dry-run.',
    '',
    `PR: ${prNumber === null ? 'unknown' : `#${prNumber}`}`,
    `Mode: ${unresolvedOnly ? 'unresolved threads' : 'all threads'}`,
    `Include outdated: ${includeOutdated ? 'yes' : 'no'}`,
    '',
    'GitHub review threads were not read and state was not updated.',
    '',
    'Next expected action:',
    'Run `/flow-comments` without `--dry-run` when ready to read GitHub review threads.',
  ].join('\n');

  return {
    status: 'dry_run',
    prNumber,
    prUrl,
    threads: [],
    filteredThreads: [],
    triage: null,
    summary,
    warnings: [
      ...options.warnings,
      'Dry run requested; GitHub review threads were not read and state was not updated.',
    ],
    lifecyclePhase: options.sessionState.lifecycle.phase,
    nextExpectedActions: [
      'Run /flow-comments without --dry-run when ready to read GitHub review threads.',
      'Do not claim review-thread triage from a dry-run plan.',
    ],
    sessionState: options.sessionState,
    incomplete: false,
    json: options.options.json === true,
  };
}

function resolveTargetPrOption(
  explicitPr: number | string | undefined,
  sessionState: CodeflowSessionState,
): number | string | undefined {
  if (explicitPr !== undefined) {
    return explicitPr;
  }

  return sessionState.pullRequests.lastPullRequest?.number;
}

function resolveUnresolvedOnly(options: FlowCommentsOptions, config: CodeflowConfig): boolean {
  if (options.includeResolved === true) {
    return false;
  }

  if (options.unresolvedOnly !== undefined) {
    return options.unresolvedOnly;
  }

  return config.reviewComments.unresolvedOnly;
}

function getFlowCommentsStatus(options: {
  filteredThreadCount: number;
  incomplete: boolean;
}): 'found' | 'none' | 'failed' {
  if (options.incomplete) {
    return 'failed';
  }

  if (options.filteredThreadCount > 0) {
    return 'found';
  }

  return 'none';
}

function getLifecyclePhaseForComments(options: {
  status: FlowCommentsResult['status'];
  triage: CodeflowReviewCommentTriageResult | null;
  sessionState: CodeflowSessionState;
}): CodeflowLifecyclePhase {
  if (options.status === 'failed') {
    return 'blocked';
  }

  if (options.triage?.requiresHumanDecisionCount && options.triage.requiresHumanDecisionCount > 0) {
    return 'blocked';
  }

  if ((options.triage?.classificationCounts.valid ?? 0) > 0) {
    return 'fixing_review_findings';
  }

  if (options.status === 'found') {
    return 'review_triage';
  }

  return options.sessionState.lifecycle.phase;
}

function getFlowCommentsNextExpectedActions(options: {
  status: FlowCommentsResult['status'];
  triage: CodeflowReviewCommentTriageResult | null;
  filteredThreadCount: number;
  incomplete: boolean;
}): string[] {
  if (options.status === 'failed' || options.incomplete) {
    return [
      'Treat the review-thread scan as incomplete; do not claim there are no selected review threads.',
      'Increase reviewComments.maxThreadsPerRun or pass --max-threads, then rerun /flow-comments.',
    ];
  }

  if (options.triage?.requiresHumanDecisionCount && options.triage.requiresHumanDecisionCount > 0) {
    return [
      'Ask for the required human decision before changing code, replying, or resolving review threads.',
      'Do not implement speculative product, security, API, or design choices.',
    ];
  }

  if ((options.triage?.classificationCounts.valid ?? 0) > 0) {
    return [
      'Fix valid review findings with focused changes only.',
      'Run /flow-check, commit through /flow-commit, push through the PR flow, then re-run /flow-watch.',
      'Do not reply or resolve review threads until /flow-fix-comments is implemented.',
    ];
  }

  if (options.status === 'found' || options.filteredThreadCount > 0) {
    return [
      'Classify each thread as valid, invalid, stale, already_fixed, or needs_human.',
      'Do not reply, resolve, fix code, commit, push, merge, or approve from /flow-comments.',
    ];
  }

  return [
    'Continue to final reporting when verification evidence is complete.',
    'Do not claim final_reported solely from /flow-comments.',
  ];
}

function validateThreadMode(current: boolean | undefined, next: boolean, token: string): void {
  if (current === undefined || current === next) {
    return;
  }

  throw new CodeflowReviewCommentsError({
    code: 'invalid_arguments',
    message: `Choose either --all or --unresolved, not both. Conflicting option: ${token}`,
    details: { option: token },
  });
}

function resolveMaxThreads(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CodeflowReviewCommentsError({
      code: 'invalid_arguments',
      message: 'maxThreads must be a positive integer.',
      details: { maxThreads: value },
    });
  }

  return value;
}

function parseOptionalPrNumber(value: number | string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  return parsePositiveInteger(String(value), 'pr');
}

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new CodeflowReviewCommentsError({
      code: 'invalid_arguments',
      message: `${flagName} requires a positive integer value.`,
      details: { flagName, value },
    });
  }

  return parsed;
}

function readFlagValue(tokens: string[], index: number, flagName: string): string {
  const value = tokens[index + 1];

  if (!value || value.startsWith('--')) {
    throw new CodeflowReviewCommentsError({
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
    throw new CodeflowReviewCommentsError({
      code: 'invalid_arguments',
      message: 'Unterminated quote in /flow-comments arguments.',
    });
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
