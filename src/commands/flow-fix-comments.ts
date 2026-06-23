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
  CodeflowRenderedReviewReply,
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
import { readJsonPayloadFile } from '../utils/json-payload';
import {
  parsePositiveInteger,
  readFlagValue,
  resolveCommandBaseCwd,
  splitCommandArguments,
} from './command-args';

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

interface ReviewFixExecutionPlan {
  item: CodeflowReviewFixItem;
  renderedReply: CodeflowRenderedReviewReply | null;
  shouldIncludeReply: boolean;
  shouldIncludeResolution: boolean;
  skipReason: string | null;
  repliedToCommentId: string | null;
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

  const explicitApply = options.apply === true;
  const explicitApplyReplies = explicitApply || options.applyReplies === true;
  const explicitApplyResolutions = explicitApply || options.applyResolutions === true;
  const explicitReplyOnly = options.applyReplies === true && !explicitApply && options.applyResolutions !== true;
  const explicitResolutionOnly = options.applyResolutions === true && !explicitApply && options.applyReplies !== true;
  const applyReplies = explicitApplyReplies || (
    !options.dryRun && config.reviewComments.autoReply && !explicitResolutionOnly
  );
  const applyResolutions = explicitApplyResolutions || (
    !options.dryRun && config.reviewComments.autoResolve && !explicitReplyOnly
  );
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

  const reviewCommentsPrMismatch = !options.detached && prNumber !== null && latestReviewComments !== null &&
    latestReviewComments.prNumber !== null && latestReviewComments.prNumber !== prNumber;
  const canValidateAgainstReviewState = options.detached !== true &&
    latestReviewComments?.status !== 'failed' &&
    !reviewCommentsPrMismatch;

  const validation = validateReviewFixPayload(options.payload, {
    knownThreads: canValidateAgainstReviewState ? latestReviewComments?.threads : undefined,
    knownThreadIds: canValidateAgainstReviewState ? latestReviewComments?.threadIds : undefined,
    requireThreadMatch: canValidateAgainstReviewState,
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
    (options.detached === true ? [] : latestReviewComments?.threads ?? []).map((thread) => [thread.threadId, thread]),
  );
  let mutationFailed = false;

  if (!options.detached && latestReviewComments?.status === 'failed') {
    blockAllReviewFixItems(
      validation.payload.items,
      blocked,
      'latest /flow-comments state is incomplete or failed; rerun /flow-comments before mutating review threads',
    );
  } else if (reviewCommentsPrMismatch) {
    blockAllReviewFixItems(
      validation.payload.items,
      blocked,
      `latest /flow-comments state belongs to PR #${latestReviewComments?.prNumber}, not PR #${prNumber}; rerun /flow-comments for the target PR before mutating review threads`,
    );
  } else {
    const plans = await buildReviewFixExecutionPlans({
      items: validation.payload.items,
      knownThreadsById,
      config,
      cwd: resolveCommandBaseCwd(cwd, loadedConfig.configPath),
      dryRun,
      applyReplies,
      applyResolutions,
      explicitApplyReplies,
      explicitApplyResolutions,
      allowInvalidResolution: options.allowInvalidResolution,
      sessionState,
      prNumber,
      detached: options.detached === true,
      warnings,
      blocked,
      requiresHumanDecision,
    });

    for (const plan of plans) {
      const { item, renderedReply, shouldIncludeReply, shouldIncludeResolution, repliedToCommentId } = plan;

      if (plan.skipReason) {
        replies.push(skippedReply(item, plan.skipReason));
        resolutions.push(skippedResolution(item, plan.skipReason));
        continue;
      }

      if (shouldIncludeReply) {
        if (dryRun || !applyReplies) {
          replies.push(plannedReply(item, renderedReply?.body ?? null));
        } else if (alreadyPostedReply(sessionState, item.threadId, repliedToCommentId)) {
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
              repliedToCommentId,
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

      if (shouldIncludeResolution) {
        if (dryRun || !applyResolutions) {
          resolutions.push(plannedResolution(item));
        } else {
          try {
            const resolution = await (options.resolveThread ?? resolveReviewThread)({
              cwd,
              threadId: item.threadId,
              ghClient: options.ghClient,
            });
            const normalizedResolution = {
              ...resolution,
              classification: item.classification,
            };
            resolutions.push(normalizedResolution);

            if (normalizedResolution.status !== 'resolved' || !normalizedResolution.resolved) {
              mutationFailed = true;
              blocked.push({
                threadId: item.threadId,
                classification: item.classification,
                reason: normalizedResolution.reason ?? 'GitHub did not report the thread as resolved.',
              });
            }
          } catch (error) {
            if (isThreadAlreadyResolvedError(error)) {
              resolutions.push({
                threadId: item.threadId,
                classification: item.classification,
                status: 'resolved',
                resolved: true,
                reason: 'GitHub reported the review thread is already resolved.',
              });
              warnings.push(`Skipping resolution for ${item.threadId}; GitHub already reports it resolved.`);
              continue;
            }

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
    resolutions,
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
  const tokens = splitCommandArguments(
    args,
    '/flow-fix-comments',
    invalidFlowFixCommentsArguments,
  );
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
      pr = parsePositiveInteger(
        readFlagValue(tokens, index, '--pr', invalidFlowFixCommentsArguments),
        '--pr',
        invalidFlowFixCommentsArguments,
      );
      index += 1;
      continue;
    }

    if (token.startsWith('--pr=')) {
      pr = parsePositiveInteger(
        token.slice('--pr='.length),
        '--pr',
        invalidFlowFixCommentsArguments,
      );
      continue;
    }

    if (token === '--payload') {
      payloadPath = readFlagValue(tokens, index, '--payload', invalidFlowFixCommentsArguments);
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
  return readJsonPayloadFile<CodeflowReviewFixPayload, CodeflowReviewFixError['code']>({
    payloadPath,
    cwd,
    label: 'Review-fix payload',
    fileNotFoundCode: 'payload_file_not_found',
    fileUnreadableCode: 'payload_file_unreadable',
    invalidJsonCode: 'invalid_payload_json',
    createError: (options) => new CodeflowReviewFixError(options),
  });
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

function blockAllReviewFixItems(
  items: CodeflowReviewFixItem[],
  blocked: CodeflowReviewFixBlockedItem[],
  reason: string,
): void {
  for (const item of items) {
    blocked.push({
      threadId: item.threadId,
      classification: item.classification,
      reason,
    });
  }
}

function resolvePrNumber(
  options: Pick<FlowFixCommentsOptions, 'pr' | 'payload'>,
  sessionState: CodeflowSessionState,
): number | null {
  if (options.pr !== undefined) {
    const prNumber = parsePositiveInteger(
      String(options.pr),
      'pr',
      invalidFlowFixCommentsArguments,
    );

    if (options.payload.prNumber !== undefined && options.payload.prNumber !== prNumber) {
      throw new CodeflowReviewFixError({
        code: 'invalid_arguments',
        message: `--pr ${prNumber} does not match payload.prNumber ${options.payload.prNumber}.`,
        details: { prNumber, payloadPrNumber: options.payload.prNumber },
      });
    }

    return prNumber;
  }

  if (options.payload.prNumber !== undefined) {
    return options.payload.prNumber;
  }

  return sessionState.pullRequests.lastPullRequest?.number
    ?? sessionState.reviewComments?.lastRun?.prNumber
    ?? null;
}

async function buildReviewFixExecutionPlans(options: {
  items: CodeflowReviewFixItem[];
  knownThreadsById: Map<string, CodeflowStoredReviewCommentThread>;
  config: CodeflowConfig;
  cwd: string;
  dryRun: boolean;
  applyReplies: boolean;
  applyResolutions: boolean;
  explicitApplyReplies: boolean;
  explicitApplyResolutions: boolean;
  allowInvalidResolution?: boolean;
  sessionState: CodeflowSessionState;
  prNumber: number | null;
  detached: boolean;
  warnings: string[];
  blocked: CodeflowReviewFixBlockedItem[];
  requiresHumanDecision: string[];
}): Promise<ReviewFixExecutionPlan[]> {
  const plans: ReviewFixExecutionPlan[] = [];

  for (const item of options.items) {
    const knownThread = options.knownThreadsById.get(item.threadId) ?? null;
    const repliedToCommentId = knownThread?.latestCommentId ?? null;
    const resolutionModeRequested = shouldRenderOrApplyResolution({
      dryRun: options.dryRun,
      applyResolutions: options.applyResolutions,
      explicitApplyReplies: options.explicitApplyReplies,
      explicitApplyResolutions: options.explicitApplyResolutions,
    });
    const replyModeRequested = shouldRenderOrApplyReply({
      dryRun: options.dryRun,
      applyReplies: options.applyReplies,
      explicitApplyReplies: options.explicitApplyReplies,
      explicitApplyResolutions: options.explicitApplyResolutions,
    });

    if (!options.detached && !knownThread) {
      options.blocked.push({
        threadId: item.threadId,
        classification: item.classification,
        reason: 'thread is present only in /flow-comments ID metadata; rerun /flow-comments with full stored triage metadata before mutating this thread',
      });
      continue;
    }

    if (alreadyResolvedThread(options.sessionState, item.threadId, knownThread)) {
      const skipReason = 'thread was already resolved in this Codeflow session';
      options.warnings.push(`Skipping duplicate resolution for ${item.threadId}; ${skipReason}.`);
      plans.push({
        item,
        renderedReply: null,
        shouldIncludeReply: false,
        shouldIncludeResolution: false,
        skipReason,
        repliedToCommentId,
      });
      continue;
    }

    const policy = evaluateReviewFixPolicy({
      item,
      config: options.config.reviewComments,
      knownThread,
      latestCheckRun: options.sessionState.checks.lastRun,
      latestCommit: options.sessionState.commits.lastCommit,
      latestGitHubChecksRun: options.sessionState.githubChecks?.lastRun ?? null,
      allowInvalidResolution: options.allowInvalidResolution,
      prNumber: options.prNumber,
      includeResolutionPolicy: resolutionModeRequested,
      includeReplyPolicy: replyModeRequested,
      autoResolveMode: resolutionModeRequested && options.applyResolutions && !options.explicitApplyResolutions,
    } satisfies EvaluateReviewFixPolicyOptions);
    options.warnings.push(...policy.warnings);

    if (policy.requiresHumanDecision) {
      options.requiresHumanDecision.push(item.threadId);
    }

    if (policy.shouldSkip) {
      plans.push({
        item,
        renderedReply: null,
        shouldIncludeReply: false,
        shouldIncludeResolution: false,
        skipReason: 'thread is already resolved',
        repliedToCommentId,
      });
      continue;
    }

    const shouldIncludeResolution = policy.canResolve && resolutionModeRequested;
    const shouldIncludeReply = policy.canReply && replyModeRequested;

    if (policy.blockedReasons.length > 0) {
      options.blocked.push({
        threadId: item.threadId,
        classification: item.classification,
        reason: policy.blockedReasons.join('; '),
      });

      if (!shouldIncludeReply && !shouldIncludeResolution) {
        continue;
      }
    }
    let renderedReply: CodeflowRenderedReviewReply | null = null;

    if (shouldIncludeReply) {
      try {
        renderedReply = await renderReviewReply({
          ...item,
          resolveRequested: shouldIncludeResolution,
        }, {
          cwd: options.cwd,
          config: options.config,
        });
        options.warnings.push(...renderedReply.warnings);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'review reply rendering failed';
        options.blocked.push({
          threadId: item.threadId,
          classification: item.classification,
          reason: message,
        });
        continue;
      }
    }

    plans.push({
      item,
      renderedReply,
      shouldIncludeReply,
      shouldIncludeResolution,
      skipReason: null,
      repliedToCommentId,
    });
  }

  return plans;
}

function getReviewFixStatus(options: {
  dryRun: boolean;
  mutationFailed: boolean;
  replies: CodeflowReviewReplyResult[];
  resolutions: CodeflowReviewResolutionResult[];
  blocked: CodeflowReviewFixBlockedItem[];
  requiresHumanDecision: string[];
}): CodeflowReviewFixResultStatus {
  if (options.mutationFailed) {
    return 'failed';
  }

  if (options.blocked.length > 0 || options.requiresHumanDecision.length > 0) {
    return 'blocked';
  }

  if (options.dryRun) {
    return 'dry_run';
  }

  if (
    options.replies.some((reply) => reply.status === 'posted') ||
    options.resolutions.some((resolution) => resolution.status === 'resolved')
  ) {
    return 'applied';
  }

  return 'dry_run';
}

function getLifecyclePhaseForReviewFix(options: {
  status: CodeflowReviewFixResultStatus;
  blocked: CodeflowReviewFixBlockedItem[];
  resolutions: CodeflowReviewResolutionResult[];
  requiresHumanDecision: string[];
  sessionState: CodeflowSessionState;
}): CodeflowLifecyclePhase {
  if (options.status === 'dry_run') {
    return options.sessionState.lifecycle.phase;
  }

  if (options.status === 'failed' || options.requiresHumanDecision.length > 0) {
    return 'blocked';
  }

  if (options.blocked.length > 0) {
    return options.blocked.every((item) => /check|verification|commit/i.test(item.reason))
      ? 'fixing_review_findings'
      : 'blocked';
  }

  if (
    options.status === 'applied' &&
    options.sessionState.checks.lastRun?.status === 'passed' &&
    allKnownReviewThreadsResolved(options.sessionState, options.resolutions)
  ) {
    return 'verified';
  }

  return 'review_triage';
}

function allKnownReviewThreadsResolved(
  sessionState: CodeflowSessionState,
  resolutions: CodeflowReviewResolutionResult[],
): boolean {
  const reviewState = sessionState.reviewComments?.lastRun;

  if (!reviewState || reviewState.status !== 'found') {
    return false;
  }

  if (reviewState.fetchedThreadCount !== reviewState.filteredThreadCount) {
    return false;
  }

  const storedThreadsById = new Map(reviewState.threads.map((thread) => [thread.threadId, thread]));
  const knownThreadIds = reviewState.threadIds ?? reviewState.threads.map((thread) => thread.threadId);
  const resolvedThreadIds = new Set(
    resolutions
      .filter((resolution) => resolution.status === 'resolved' && resolution.resolved)
      .map((resolution) => resolution.threadId),
  );
  const unresolvedThreadIds = knownThreadIds.filter((threadId) => {
    const storedThread = storedThreadsById.get(threadId);

    if (!storedThread) {
      return true;
    }

    return !storedThread.isResolved;
  });

  return unresolvedThreadIds.length > 0 && unresolvedThreadIds.every((threadId) => resolvedThreadIds.has(threadId));
}

function getFlowFixCommentsNextExpectedActions(options: {
  status: CodeflowReviewFixResultStatus;
  blocked: CodeflowReviewFixBlockedItem[];
  requiresHumanDecision: string[];
  dryRun: boolean;
}): string[] {
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

  if (options.dryRun || options.status === 'dry_run') {
    return [
      'Review the planned replies and resolutions.',
      'Run /flow-fix-comments with --apply-replies, --apply-resolutions, or --apply only when the plan is safe.',
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

function shouldRenderOrApplyReply(options: {
  dryRun: boolean;
  applyReplies: boolean;
  explicitApplyReplies: boolean;
  explicitApplyResolutions: boolean;
}): boolean {
  if (options.applyReplies) {
    return true;
  }

  return options.dryRun && !options.explicitApplyReplies && !options.explicitApplyResolutions;
}

function shouldRenderOrApplyResolution(options: {
  dryRun: boolean;
  applyResolutions: boolean;
  explicitApplyReplies: boolean;
  explicitApplyResolutions: boolean;
}): boolean {
  if (options.applyResolutions) {
    return true;
  }

  return options.dryRun && !options.explicitApplyReplies && !options.explicitApplyResolutions;
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

function alreadyPostedReply(
  sessionState: CodeflowSessionState,
  threadId: string,
  latestCommentId: string | null,
): boolean {
  return sessionState.reviewFix?.lastRun?.repliesPosted.some((reply) => {
    if (reply.threadId !== threadId) {
      return false;
    }

    if (!latestCommentId) {
      return true;
    }

    return reply.repliedToCommentId === latestCommentId || reply.commentId === latestCommentId;
  }) === true;
}

function isThreadAlreadyResolvedError(error: unknown): boolean {
  return error instanceof CodeflowReviewFixError && error.code === 'thread_already_resolved';
}

function alreadyResolvedThread(
  sessionState: CodeflowSessionState,
  threadId: string,
  knownThread: CodeflowStoredReviewCommentThread | null,
): boolean {
  if (knownThread?.isResolved === false) {
    return false;
  }

  return sessionState.reviewFix?.lastRun?.threadsResolved.some((resolution) => resolution.threadId === threadId) === true;
}

function invalidFlowFixCommentsArguments(
  message: string,
  details?: Record<string, unknown>,
): CodeflowReviewFixError {
  return new CodeflowReviewFixError({
    code: 'invalid_arguments',
    message,
    details,
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export type { CodeflowStoredReviewCommentThread };
