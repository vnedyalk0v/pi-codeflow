import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CodeflowConfig } from '../config/codeflow-config';
import { loadCodeflowConfig } from '../config/load-config';
import type { GhClientLike } from '../github/gh-client';
import {
  replyToReviewThread,
  type ReplyToReviewThreadOptions,
} from '../github/pr-review-thread-replies-client';
import {
  resolveReviewThread,
  type ResolveReviewThreadOptions,
} from '../github/pr-review-thread-resolution-client';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import { CodeflowReviewFixError } from '../review-comments/review-fix-errors';
import {
  evaluateReviewFixPolicy,
  type EvaluateReviewFixPolicyOptions,
} from '../review-comments/review-fix-policy';
import type {
  CodeflowReviewFixBlockedItem,
  CodeflowReviewFixItem,
  CodeflowReviewFixPayload,
  CodeflowReviewFixResult,
  CodeflowReviewFixResultStatus,
  CodeflowReviewReplyResult,
  CodeflowReviewResolutionResult,
} from '../review-comments/review-fix-payload';
import { summarizeReviewFix } from '../review-comments/review-fix-summary';
import { validateReviewFixPayload } from '../review-comments/review-fix-validation';
import { renderReviewReply } from '../review-comments/review-reply-renderer';
import type { CodeflowStoredReviewCommentThread } from '../state/review-comments-state';
import {
  createCodeflowSessionState,
  updateSessionStateWithReviewFix,
  type CodeflowSessionState,
} from '../state/session-state';
import { parseJson } from '../utils/json';

export interface FlowFixCommentsOptions {
  cwd?: string;
  pr?: number | string;
  payload: CodeflowReviewFixPayload;
  dryRun?: boolean;
  applyReplies?: boolean;
  applyResolutions?: boolean;
  apply?: boolean;
  allowInvalidResolution?: boolean;
  detached?: boolean;
  config?: CodeflowConfig;
  loadConfig?: typeof loadCodeflowConfig;
  ghClient?: GhClientLike;
  sessionState?: CodeflowSessionState;
  replyToThread?: (options: ReplyToReviewThreadOptions) => Promise<CodeflowReviewReplyResult>;
  resolveThread?: (options: ResolveReviewThreadOptions) => Promise<CodeflowReviewResolutionResult>;
}

export interface FlowFixCommentsResult extends CodeflowReviewFixResult {
  sessionState: CodeflowSessionState;
}

export interface ParsedFlowFixCommentsArguments {
  dryRun: boolean;
  applyReplies: boolean;
  applyResolutions: boolean;
  apply: boolean;
  allowInvalidResolution: boolean;
  detached: boolean;
  pr?: number;
  payloadPath?: string;
}

export async function runFlowFixComments(
  options: FlowFixCommentsOptions,
): Promise<FlowFixCommentsResult> {
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
  const sessionState = options.sessionState ?? createCodeflowSessionState({ phase: 'review_triage' });
  const warnings: string[] = [];

  if (loadedConfig.usedDefaultConfig) {
    warnings.push('No project Codeflow config was found; package defaults are in use.');
  }

  const explicitApplyReplies = options.apply === true || options.applyReplies === true;
  const explicitApplyResolutions = options.apply === true || options.applyResolutions === true;
  const applyReplies = explicitApplyReplies || (!options.dryRun && config.reviewComments.autoReply);
  const applyResolutions = explicitApplyResolutions || (!options.dryRun && config.reviewComments.autoResolve);
  const dryRun = options.dryRun === true || (!applyReplies && !applyResolutions);
  const prNumber = resolvePrNumber(options, sessionState);

  if (!config.reviewComments.enabled) {
    return blockedResult({
      status: 'blocked',
      prNumber,
      reason: 'Codeflow review comments are disabled by reviewComments.enabled; refusing review-thread mutations.',
      warnings,
      sessionState,
      dryRun,
      applyReplies,
      applyResolutions,
    });
  }

  const latestReviewComments = sessionState.reviewComments?.lastRun ?? null;

  if (!options.detached && !latestReviewComments) {
    throw new CodeflowReviewFixError({
      code: 'missing_review_comments_state',
      message: '/flow-fix-comments requires latest /flow-comments state unless --detached is used.',
    });
  }

  const validation = validateReviewFixPayload(options.payload, {
    knownThreads: latestReviewComments?.threads,
    detached: options.detached,
    config: config.reviewComments,
    allowInvalidResolution: options.allowInvalidResolution,
  });

  if (!validation.valid || !validation.payload) {
    throw new CodeflowReviewFixError({
      code: 'invalid_payload',
      message: 'Review-fix payload failed validation.',
      details: { errors: validation.errors },
    });
  }

  const replies: CodeflowReviewReplyResult[] = [];
  const resolutions: CodeflowReviewResolutionResult[] = [];
  const blocked: CodeflowReviewFixBlockedItem[] = [];
  const requiresHumanDecision: string[] = [];
  const knownThreadsById = new Map(
    (latestReviewComments?.threads ?? []).map((thread) => [thread.threadId, thread]),
  );
  let mutationFailed = false;

  if (!options.detached && latestReviewComments?.status === 'failed') {
    for (const item of validation.payload.items) {
      blocked.push({
        threadId: item.threadId,
        classification: item.classification,
        reason: 'latest /flow-comments state is incomplete or failed; rerun /flow-comments before mutating review threads',
      });
    }
  } else {
    for (const item of validation.payload.items) {
      const knownThread = knownThreadsById.get(item.threadId) ?? null;
      const policy = evaluateReviewFixPolicy({
        item,
        config: config.reviewComments,
        knownThread,
        latestCheckRun: sessionState.checks.lastRun,
        latestCommit: sessionState.commits.lastCommit,
        latestGitHubChecksRun: sessionState.githubChecks?.lastRun ?? null,
        allowInvalidResolution: options.allowInvalidResolution,
      } satisfies EvaluateReviewFixPolicyOptions);
      warnings.push(...policy.warnings);

      if (policy.requiresHumanDecision) {
        requiresHumanDecision.push(item.threadId);
      }

      if (policy.shouldSkip) {
        replies.push(skippedReply(item, 'thread is already resolved'));
        resolutions.push(skippedResolution(item, 'thread is already resolved'));
        continue;
      }

      if (policy.blockedReasons.length > 0) {
        blocked.push({
          threadId: item.threadId,
          classification: item.classification,
          reason: policy.blockedReasons.join('; '),
        });
        continue;
      }

      const renderedReply = policy.canReply
        ? await renderReviewReply(item, {
            cwd: resolveCommandBaseCwd(cwd, loadedConfig.configPath),
            config,
          })
        : null;
      warnings.push(...(renderedReply?.warnings ?? []));

      if (policy.canReply) {
        if (dryRun || !applyReplies) {
          replies.push(plannedReply(item, renderedReply?.body ?? null));
        } else if (alreadyPostedReply(sessionState, item.threadId)) {
          replies.push(skippedReply(item, 'reply was already posted in this Codeflow session'));
          warnings.push(`Skipping duplicate reply for ${item.threadId}; reply was already posted in this session.`);
        } else {
          try {
            const reply = await (options.replyToThread ?? replyToReviewThread)({
              cwd,
              threadId: item.threadId,
              body: renderedReply?.body ?? '',
              ghClient: options.ghClient,
            });
            replies.push({
              ...reply,
              classification: item.classification,
              body: renderedReply?.body ?? reply.body,
            });
          } catch (error) {
            mutationFailed = true;
            const message = error instanceof Error ? error.message : 'review-thread reply mutation failed';
            replies.push(failedReply(item, message));
            blocked.push({
              threadId: item.threadId,
              classification: item.classification,
              reason: message,
            });
            continue;
          }
        }
      }

      if (policy.canResolve) {
        if (dryRun || !applyResolutions) {
          resolutions.push(plannedResolution(item));
        } else {
          try {
            const resolution = await (options.resolveThread ?? resolveReviewThread)({
              cwd,
              threadId: item.threadId,
              ghClient: options.ghClient,
            });
            resolutions.push({
              ...resolution,
              classification: item.classification,
            });
          } catch (error) {
            mutationFailed = true;
            const message = error instanceof Error ? error.message : 'review-thread resolve mutation failed';
            resolutions.push(failedResolution(item, message));
            blocked.push({
              threadId: item.threadId,
              classification: item.classification,
              reason: message,
            });
          }
        }
      }
    }
  }

  const status = getReviewFixStatus({
    dryRun,
    mutationFailed,
    replies,
    resolutions,
    blocked,
    requiresHumanDecision,
  });
  const lifecyclePhase = getLifecyclePhaseForReviewFix({
    status,
    blocked,
    requiresHumanDecision,
    sessionState,
  });
  const uniqueWarnings = uniqueStrings(warnings);
  const summary = summarizeReviewFix({
    status,
    prNumber,
    replies,
    resolutions,
    blocked,
    requiresHumanDecision,
    warnings: uniqueWarnings,
    dryRun,
    applyReplies,
    applyResolutions,
  });
  const nextExpectedActions = getFlowFixCommentsNextExpectedActions({
    status,
    blocked,
    requiresHumanDecision,
    dryRun,
  });
  const nextSessionState = updateSessionStateWithReviewFix(sessionState, {
    status,
    prNumber,
    replies,
    resolutions,
    blocked,
    requiresHumanDecision,
    summary,
  }, lifecyclePhase);

  return {
    status,
    prNumber,
    replies,
    resolutions,
    blocked,
    requiresHumanDecision,
    summary,
    warnings: uniqueWarnings,
    lifecyclePhase,
    nextExpectedActions,
    sessionState: nextSessionState,
  };
}

export function parseFlowFixCommentsArguments(args: string): ParsedFlowFixCommentsArguments {
  const tokens = splitCommandArguments(args);
  let dryRun = false;
  let applyReplies = false;
  let applyResolutions = false;
  let apply = false;
  let allowInvalidResolution = false;
  let detached = false;
  let pr: number | undefined;
  let payloadPath: string | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '--dry-run' || token === '--dryRun') {
      dryRun = true;
      continue;
    }

    if (token === '--apply-replies') {
      applyReplies = true;
      continue;
    }

    if (token === '--apply-resolutions') {
      applyResolutions = true;
      continue;
    }

    if (token === '--apply') {
      apply = true;
      applyReplies = true;
      applyResolutions = true;
      continue;
    }

    if (token === '--allow-invalid-resolution') {
      allowInvalidResolution = true;
      continue;
    }

    if (token === '--detached') {
      detached = true;
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

    if (token === '--payload') {
      payloadPath = readFlagValue(tokens, index, '--payload');
      index += 1;
      continue;
    }

    if (token.startsWith('--payload=')) {
      payloadPath = token.slice('--payload='.length);
      continue;
    }

    if (token.startsWith('--')) {
      throw new CodeflowReviewFixError({
        code: 'invalid_arguments',
        message: `Unknown /flow-fix-comments option: ${token}`,
        details: { option: token },
      });
    }

    throw new CodeflowReviewFixError({
      code: 'invalid_arguments',
      message: `/flow-fix-comments only accepts flags; unexpected argument: ${token}`,
      details: { argument: token },
    });
  }

  return {
    dryRun,
    applyReplies,
    applyResolutions,
    apply,
    allowInvalidResolution,
    detached,
    ...(pr === undefined ? {} : { pr }),
    ...(payloadPath === undefined ? {} : { payloadPath }),
  };
}

export async function readReviewFixPayloadFile(
  payloadPath: string,
  cwd = process.cwd(),
): Promise<CodeflowReviewFixPayload> {
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

    throw new CodeflowReviewFixError({
      code,
      message: `Review-fix payload file could not be read: ${resolvedPath}`,
      details: { payloadPath: resolvedPath },
      cause: error,
    });
  }

  try {
    return parseJson(text) as CodeflowReviewFixPayload;
  } catch (error) {
    throw new CodeflowReviewFixError({
      code: 'invalid_payload_json',
      message: `Review-fix payload file contains invalid JSON: ${resolvedPath}`,
      details: { payloadPath: resolvedPath },
      cause: error,
    });
  }
}

export function formatFlowFixCommentsResult(result: FlowFixCommentsResult): string {
  return result.summary;
}

function blockedResult(options: {
  status: CodeflowReviewFixResultStatus;
  prNumber: number | null;
  reason: string;
  warnings: string[];
  sessionState: CodeflowSessionState;
  dryRun: boolean;
  applyReplies: boolean;
  applyResolutions: boolean;
}): FlowFixCommentsResult {
  const blocked = [{
    threadId: 'unknown',
    classification: 'unknown',
    reason: options.reason,
  }];
  const summary = summarizeReviewFix({
    status: options.status,
    prNumber: options.prNumber,
    replies: [],
    resolutions: [],
    blocked,
    requiresHumanDecision: [],
    warnings: options.warnings,
    dryRun: options.dryRun,
    applyReplies: options.applyReplies,
    applyResolutions: options.applyResolutions,
  });
  const sessionState = updateSessionStateWithReviewFix(options.sessionState, {
    status: options.status,
    prNumber: options.prNumber,
    replies: [],
    resolutions: [],
    blocked,
    requiresHumanDecision: [],
    summary,
  }, 'blocked');

  return {
    status: options.status,
    prNumber: options.prNumber,
    replies: [],
    resolutions: [],
    blocked,
    requiresHumanDecision: [],
    summary,
    warnings: options.warnings,
    lifecyclePhase: 'blocked',
    nextExpectedActions: ['Enable reviewComments.enabled before using /flow-fix-comments, or handle review threads manually.'],
    sessionState,
  };
}

function resolvePrNumber(
  options: Pick<FlowFixCommentsOptions, 'pr' | 'payload'>,
  sessionState: CodeflowSessionState,
): number | null {
  if (options.pr !== undefined) {
    return parsePositiveInteger(String(options.pr), 'pr');
  }

  if (options.payload.prNumber !== undefined) {
    return options.payload.prNumber;
  }

  return sessionState.pullRequests.lastPullRequest?.number
    ?? sessionState.reviewComments?.lastRun?.prNumber
    ?? null;
}

function getReviewFixStatus(options: {
  dryRun: boolean;
  mutationFailed: boolean;
  replies: CodeflowReviewReplyResult[];
  resolutions: CodeflowReviewResolutionResult[];
  blocked: CodeflowReviewFixBlockedItem[];
  requiresHumanDecision: string[];
}): CodeflowReviewFixResultStatus {
  if (options.dryRun) {
    return 'dry_run';
  }

  if (options.mutationFailed) {
    return 'failed';
  }

  if (
    options.replies.some((reply) => reply.status === 'posted') ||
    options.resolutions.some((resolution) => resolution.status === 'resolved')
  ) {
    return 'applied';
  }

  if (options.blocked.length > 0 || options.requiresHumanDecision.length > 0) {
    return 'blocked';
  }

  return 'dry_run';
}

function getLifecyclePhaseForReviewFix(options: {
  status: CodeflowReviewFixResultStatus;
  blocked: CodeflowReviewFixBlockedItem[];
  requiresHumanDecision: string[];
  sessionState: CodeflowSessionState;
}): CodeflowLifecyclePhase {
  if (options.status === 'dry_run') {
    return options.sessionState.lifecycle.phase === 'fixing_review_findings'
      ? 'fixing_review_findings'
      : 'review_triage';
  }

  if (options.status === 'failed' || options.requiresHumanDecision.length > 0) {
    return 'blocked';
  }

  if (options.blocked.length > 0) {
    return options.blocked.every((item) => /check|verification|commit/i.test(item.reason))
      ? 'fixing_review_findings'
      : 'blocked';
  }

  if (options.status === 'applied' && options.sessionState.checks.lastRun?.status === 'passed') {
    return 'verified';
  }

  return 'review_triage';
}

function getFlowFixCommentsNextExpectedActions(options: {
  status: CodeflowReviewFixResultStatus;
  blocked: CodeflowReviewFixBlockedItem[];
  requiresHumanDecision: string[];
  dryRun: boolean;
}): string[] {
  if (options.dryRun || options.status === 'dry_run') {
    return [
      'Review the planned replies and resolutions.',
      'Run /flow-fix-comments with --apply-replies, --apply-resolutions, or --apply only when the plan is safe.',
    ];
  }

  if (options.requiresHumanDecision.length > 0) {
    return [
      'Ask for the required human review decision before continuing.',
      'Do not reply with a final decision or resolve needs_human threads automatically.',
    ];
  }

  if (options.blocked.length > 0) {
    return [
      'Address the blocked verification or policy reasons, then rerun /flow-fix-comments.',
      'Do not bypass review-thread policy with raw GitHub mutations.',
    ];
  }

  if (options.status === 'applied') {
    return [
      'Rerun /flow-comments to confirm remaining unresolved review threads.',
      'Continue to final reporting only after review comments and verification evidence are clear.',
    ];
  }

  return ['Inspect the result and rerun /flow-fix-comments after correcting the payload.'];
}

function plannedReply(item: CodeflowReviewFixItem, body: string | null): CodeflowReviewReplyResult {
  return {
    threadId: item.threadId,
    classification: item.classification,
    status: 'planned',
    commentId: null,
    url: null,
    body,
  };
}

function skippedReply(item: CodeflowReviewFixItem, reason: string): CodeflowReviewReplyResult {
  return {
    threadId: item.threadId,
    classification: item.classification,
    status: 'skipped',
    commentId: null,
    url: null,
    body: null,
    reason,
  };
}

function failedReply(item: CodeflowReviewFixItem, reason: string): CodeflowReviewReplyResult {
  return {
    threadId: item.threadId,
    classification: item.classification,
    status: 'failed',
    commentId: null,
    url: null,
    body: null,
    reason,
  };
}

function plannedResolution(item: CodeflowReviewFixItem): CodeflowReviewResolutionResult {
  return {
    threadId: item.threadId,
    classification: item.classification,
    status: 'planned',
    resolved: false,
  };
}

function skippedResolution(item: CodeflowReviewFixItem, reason: string): CodeflowReviewResolutionResult {
  return {
    threadId: item.threadId,
    classification: item.classification,
    status: 'skipped',
    resolved: false,
    reason,
  };
}

function failedResolution(item: CodeflowReviewFixItem, reason: string): CodeflowReviewResolutionResult {
  return {
    threadId: item.threadId,
    classification: item.classification,
    status: 'failed',
    resolved: false,
    reason,
  };
}

function alreadyPostedReply(sessionState: CodeflowSessionState, threadId: string): boolean {
  return sessionState.reviewFix?.lastRun?.repliesPosted.some((reply) => reply.threadId === threadId) === true;
}

function resolveCommandBaseCwd(cwd: string, configPath: string | null): string {
  if (configPath === null) {
    return cwd;
  }

  return path.dirname(path.dirname(configPath));
}

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new CodeflowReviewFixError({
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
    throw new CodeflowReviewFixError({
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
    throw new CodeflowReviewFixError({
      code: 'invalid_arguments',
      message: 'Unterminated quote in /flow-fix-comments arguments.',
    });
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export type { CodeflowStoredReviewCommentThread };
