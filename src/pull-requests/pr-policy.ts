import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import { createGitHubPullRequest, type GitHubPullRequestResult } from '../github/pr-client';
import type { GhClientLike } from '../github/gh-client';
import { GitClient } from '../git/git-client';
import { GitError } from '../git/git-errors';
import type { GitStatus, GitStatusEntry } from '../git/git-status';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import { isReservedBranch } from '../safety/reserved-branch-policy';
import type { CodeflowSessionState } from '../state/session-state';
import { renderPrBody } from './pr-body-renderer';
import { CodeflowPrError } from './pr-errors';
import { validatePrPayload } from './pr-payload-validation';
import type { CodeflowPrPayload, CodeflowPrRenderResult, CodeflowPrResult } from './pr-payload';

export interface CreateCodeflowPullRequestOptions {
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
  gitClient?: GitClient;
  ghClient?: GhClientLike;
  sessionState?: CodeflowSessionState;
  templateCwd?: string;
}

interface PrSafetyResult {
  baseBranch: string;
  headBranch: string;
  currentBranch: string | null;
  warnings: string[];
}

export async function createCodeflowPullRequestFromPayload(
  options: CreateCodeflowPullRequestOptions,
): Promise<CodeflowPrResult> {
  const cwd = options.cwd ?? process.cwd();
  const templateCwd = options.templateCwd ?? cwd;
  const config = options.config ?? getDefaultCodeflowConfig();
  const gitClient = options.gitClient ?? new GitClient({ cwd });
  const validation = validatePrPayload(options.payload, {
    config,
    allowUnverified: options.allowUnverified === true,
  });

  if (!validation.valid) {
    throw new CodeflowPrError({
      code: 'invalid_payload',
      message: 'PR payload failed validation.',
      validationErrors: validation.errors,
    });
  }

  const safety = await evaluatePrSafety({
    config,
    gitClient,
    payload: validation.payload,
    baseBranchOverride: options.baseBranch,
    headBranchOverride: options.headBranch,
    allowReservedHead: options.allowReservedHead === true,
    allowUnverified: options.allowUnverified === true,
    dryRun: options.dryRun === true,
    sessionState: options.sessionState,
  });
  const rendered = await renderPrBody(validation.payload, { cwd: templateCwd, config });
  const draft = resolveDraftFlag(options.draft, validation.payload.draft, config);
  const warnings = [
    ...validation.warnings,
    ...safety.warnings,
    ...rendered.warnings,
  ];

  if (options.dryRun) {
    return makePrResult({
      status: 'dry_run',
      pr: null,
      baseBranch: safety.baseBranch,
      headBranch: safety.headBranch,
      rendered,
      payload: validation.payload,
      warnings,
      validationWarnings: validation.warnings,
      lifecyclePhase: 'committed',
      draft,
    });
  }

  await ensureHeadBranchPushed({
    gitClient,
    config,
    headBranch: safety.headBranch,
    currentBranch: safety.currentBranch,
    push: resolvePushFlag(options.push, config),
  });

  const pr = await createGitHubPullRequest({
    cwd,
    baseBranch: safety.baseBranch,
    headBranch: safety.headBranch,
    title: rendered.title,
    body: rendered.body,
    draft,
    updateExisting: config.pullRequest.updateExisting,
    ghClient: options.ghClient,
  });

  warnings.push(...pr.warnings);

  return makePrResult({
    status: 'created',
    pr,
    baseBranch: pr.baseBranch,
    headBranch: pr.headBranch,
    rendered,
    payload: validation.payload,
    warnings,
    validationWarnings: validation.warnings,
    lifecyclePhase: 'pr_opened',
    draft: pr.draft,
  });
}

async function evaluatePrSafety(options: {
  config: CodeflowConfig;
  gitClient: GitClient;
  payload: CodeflowPrPayload;
  baseBranchOverride?: string;
  headBranchOverride?: string;
  allowReservedHead: boolean;
  allowUnverified: boolean;
  dryRun: boolean;
  sessionState?: CodeflowSessionState;
}): Promise<PrSafetyResult> {
  const warnings: string[] = [];
  const currentBranch = await getCurrentBranchOrThrow(options.gitClient);
  const baseBranch = resolveBaseBranch({
    config: options.config,
    explicitBaseBranch: options.baseBranchOverride,
    payloadBaseBranch: options.payload.baseBranch,
  });
  const headBranch = resolveHeadBranch({
    explicitHeadBranch: options.headBranchOverride,
    payloadHeadBranch: options.payload.headBranch,
    currentBranch,
  });

  validateBaseHeadPair(baseBranch, headBranch);
  await validateBaseBranchExists({
    gitClient: options.gitClient,
    baseBranch,
    dryRun: options.dryRun,
    warnings,
  });
  validateHeadBranchPolicy({
    headBranch,
    config: options.config,
    allowReservedHead: options.allowReservedHead,
    warnings,
  });

  const status = await getStatusOrThrow(options.gitClient);
  collectStatusWarnings(status, warnings);
  validateCheckState({
    config: options.config,
    sessionState: options.sessionState,
    allowUnverified: options.allowUnverified,
    dryRun: options.dryRun,
    warnings,
  });
  validateCommitState(options.sessionState, warnings);
  await collectAheadWarnings({
    gitClient: options.gitClient,
    baseBranch,
    warnings,
  });

  return { baseBranch, headBranch, currentBranch, warnings };
}

function resolveBaseBranch(options: {
  config: CodeflowConfig;
  explicitBaseBranch?: string;
  payloadBaseBranch?: string;
}): string {
  const baseBranch = (
    options.explicitBaseBranch ??
    options.payloadBaseBranch ??
    options.config.pullRequest.baseBranch ??
    options.config.baseBranches.default
  ).trim();

  if (!options.config.baseBranches.allowed.includes(baseBranch)) {
    throw new CodeflowPrError({
      code: 'base_not_allowed',
      message: `Base branch ${baseBranch} is not listed in Codeflow baseBranches.allowed.`,
      details: {
        baseBranch,
        allowed: options.config.baseBranches.allowed,
      },
    });
  }

  return baseBranch;
}

function resolveHeadBranch(options: {
  explicitHeadBranch?: string;
  payloadHeadBranch?: string;
  currentBranch: string | null;
}): string {
  const headBranch = (options.explicitHeadBranch ?? options.payloadHeadBranch ?? options.currentBranch)?.trim();

  if (!headBranch) {
    throw new CodeflowPrError({
      code: 'missing_head_branch',
      message: 'Could not determine the PR head branch; provide --head or run from a named branch.',
    });
  }

  return headBranch;
}

function validateBaseHeadPair(baseBranch: string, headBranch: string): void {
  if (baseBranch !== headBranch) {
    return;
  }

  throw new CodeflowPrError({
    code: 'base_equals_head',
    message: `Refusing to open a PR from ${headBranch} to itself.`,
    details: { baseBranch, headBranch },
  });
}

async function validateBaseBranchExists(options: {
  gitClient: GitClient;
  baseBranch: string;
  dryRun: boolean;
  warnings: string[];
}): Promise<void> {
  let localRefExists = false;

  try {
    if (await options.gitClient.remoteHeadExists(options.baseBranch)) {
      return;
    }

    localRefExists =
      (await options.gitClient.remoteBranchExists(options.baseBranch)) ||
      (await options.gitClient.branchExists(options.baseBranch));
  } catch (error) {
    if (error instanceof GitError) {
      options.warnings.push(
        `Could not confirm base branch ${options.baseBranch}; GitHub may reject PR creation if it is missing.`,
      );
      return;
    }

    throw error;
  }

  if (options.dryRun) {
    options.warnings.push(
      localRefExists
        ? `Base branch ${options.baseBranch} was found only as a local ref; dry-run preview only.`
        : `Base branch ${options.baseBranch} was not found locally or on origin; dry-run preview only.`,
    );
    return;
  }

  throw new CodeflowPrError({
    code: 'missing_base_branch',
    message: `Configured PR base branch ${options.baseBranch} was not found on origin.`,
    details: { baseBranch: options.baseBranch, localRefExists },
  });
}

function validateHeadBranchPolicy(options: {
  headBranch: string;
  config: CodeflowConfig;
  allowReservedHead: boolean;
  warnings: string[];
}): void {
  if (!isReservedBranch(options.headBranch, options.config)) {
    return;
  }

  if (options.allowReservedHead && options.config.emergency.allowReservedBranchWork) {
    options.warnings.push(
      `Opening a PR from reserved branch ${options.headBranch} because explicit override and emergency policy allow it.`,
    );
    return;
  }

  throw new CodeflowPrError({
    code: 'reserved_branch',
    message: `Refusing to open a PR from reserved branch ${options.headBranch}.`,
    details: {
      headBranch: options.headBranch,
      allowReservedHead: options.allowReservedHead,
      allowReservedBranchWork: options.config.emergency.allowReservedBranchWork,
    },
  });
}

function collectStatusWarnings(status: GitStatus, warnings: string[]): void {
  if (status.clean) {
    return;
  }

  const unstagedEntries = status.entries.filter(hasUnstagedChanges);
  const stagedEntries = status.entries.filter(hasStagedChanges);

  if (stagedEntries.length > 0 || unstagedEntries.length > 0) {
    warnings.push(
      'Uncommitted changes are present and are not included in the PR until committed and pushed.',
    );
  }
}

function validateCheckState(options: {
  config: CodeflowConfig;
  sessionState?: CodeflowSessionState;
  allowUnverified: boolean;
  dryRun: boolean;
  warnings: string[];
}): void {
  const lastRun = options.sessionState?.checks.lastRun ?? null;

  if (lastRun?.status === 'passed') {
    return;
  }

  if (lastRun?.status === 'failed') {
    handleCheckBlocker({
      code: 'checks_failed',
      message: 'Latest /flow-check state failed; rerun checks or use --allow-unverified.',
      allow: options.allowUnverified || options.config.pullRequest.openWhenChecksFail,
      dryRun: options.dryRun,
      warnings: options.warnings,
    });
    return;
  }

  if (lastRun === null) {
    handleMissingChecks(options, 'No latest /flow-check state found; local verification was not proven.');
    return;
  }

  handleMissingChecks(
    options,
    `Latest /flow-check state is ${lastRun.status}; local verification was not proven.`,
  );
}

function handleMissingChecks(
  options: {
    config: CodeflowConfig;
    allowUnverified: boolean;
    dryRun: boolean;
    warnings: string[];
  },
  message: string,
): void {
  handleCheckBlocker({
    code: 'checks_required',
    message,
    allow:
      options.allowUnverified ||
      !options.config.pullRequest.requirePassedChecksBeforePr,
    dryRun: options.dryRun,
    warnings: options.warnings,
  });
}

function handleCheckBlocker(options: {
  code: 'checks_failed' | 'checks_required';
  message: string;
  allow: boolean;
  dryRun: boolean;
  warnings: string[];
}): void {
  if (options.allow || options.dryRun) {
    options.warnings.push(options.message);
    return;
  }

  throw new CodeflowPrError({
    code: options.code,
    message: options.message,
  });
}

function validateCommitState(sessionState: CodeflowSessionState | undefined, warnings: string[]): void {
  if (sessionState?.commits.lastCommit) {
    return;
  }

  warnings.push('No latest /flow-commit state found; PR may include commits not created through /flow-commit.');
}

async function collectAheadWarnings(options: {
  gitClient: GitClient;
  baseBranch: string;
  warnings: string[];
}): Promise<void> {
  const baseRef = await resolveBaseRefForAheadCount(options.gitClient, options.baseBranch);

  if (baseRef === null) {
    options.warnings.push(
      `Could not compare HEAD against base branch ${options.baseBranch}; confirm the PR contains intended commits.`,
    );
    return;
  }

  try {
    const aheadCount = await options.gitClient.getAheadCount(baseRef, 'HEAD');

    if (aheadCount === 0) {
      options.warnings.push(
        `Current branch has no commits ahead of ${baseRef}; confirm the PR has intended changes.`,
      );
    }
  } catch (error) {
    if (error instanceof GitError) {
      options.warnings.push(
        `Could not compare HEAD against ${baseRef}; confirm the PR contains intended commits.`,
      );
      return;
    }

    throw error;
  }
}

async function resolveBaseRefForAheadCount(
  gitClient: GitClient,
  baseBranch: string,
): Promise<string | null> {
  try {
    if (await gitClient.remoteBranchExists(baseBranch)) {
      return `origin/${baseBranch}`;
    }

    if (await gitClient.branchExists(baseBranch)) {
      return baseBranch;
    }
  } catch (error) {
    if (error instanceof GitError) {
      return null;
    }

    throw error;
  }

  return null;
}

async function ensureHeadBranchPushed(options: {
  gitClient: GitClient;
  config: CodeflowConfig;
  headBranch: string;
  currentBranch: string | null;
  push: boolean;
}): Promise<void> {
  if (options.push) {
    if (options.currentBranch !== options.headBranch) {
      throw new CodeflowPrError({
        code: 'branch_not_pushed',
        message: `Refusing to push ${options.headBranch} because the current branch is ${options.currentBranch ?? 'detached HEAD'}.`,
        details: { currentBranch: options.currentBranch, headBranch: options.headBranch },
      });
    }

    if (isReservedBranch(options.headBranch, options.config)) {
      throw new CodeflowPrError({
        code: 'reserved_branch',
        message: `Refusing to push reserved branch ${options.headBranch}.`,
        details: { headBranch: options.headBranch },
      });
    }

    try {
      await options.gitClient.pushBranch(options.headBranch);
      return;
    } catch (error) {
      if (error instanceof GitError) {
        throw new CodeflowPrError({
          code: 'push_failed',
          message: `git push failed: ${error.message}`,
          details: {
            exitCode: error.exitCode ?? null,
            stderr: error.stderr ?? '',
            stdout: error.stdout ?? '',
          },
          cause: error,
        });
      }

      throw error;
    }
  }

  const remoteExists =
    (await options.gitClient.remoteBranchExists(options.headBranch)) ||
    (await options.gitClient.remoteHeadExists(options.headBranch));

  if (!remoteExists) {
    throw new CodeflowPrError({
      code: 'branch_not_pushed',
      message: `Remote branch origin/${options.headBranch} was not found. Push the branch or enable pullRequest.pushBeforeCreate.`,
      details: { headBranch: options.headBranch },
    });
  }
}

function resolveDraftFlag(
  optionDraft: boolean | undefined,
  payloadDraft: boolean | undefined,
  config: Pick<CodeflowConfig, 'pullRequest'>,
): boolean {
  return optionDraft ?? payloadDraft ?? config.pullRequest.draftByDefault;
}

function resolvePushFlag(pushOption: boolean | undefined, config: Pick<CodeflowConfig, 'pullRequest'>): boolean {
  return pushOption ?? config.pullRequest.pushBeforeCreate;
}

function makePrResult(options: {
  status: CodeflowPrResult['status'];
  pr: GitHubPullRequestResult | null;
  baseBranch: string;
  headBranch: string;
  rendered: CodeflowPrRenderResult;
  payload: CodeflowPrPayload;
  warnings: string[];
  validationWarnings: string[];
  lifecyclePhase: CodeflowLifecyclePhase;
  draft: boolean;
}): CodeflowPrResult {
  return {
    status: options.status,
    prUrl: options.pr?.url ?? null,
    prNumber: options.pr?.number ?? null,
    baseBranch: options.baseBranch,
    headBranch: options.headBranch,
    title: options.rendered.title,
    body: options.rendered.body,
    payload: options.payload,
    warnings: options.warnings,
    validationWarnings: options.validationWarnings,
    lifecyclePhase: options.lifecyclePhase,
    draft: options.draft,
    updatedExisting: options.pr?.updatedExisting ?? false,
  };
}

async function getCurrentBranchOrThrow(gitClient: GitClient): Promise<string | null> {
  try {
    return await gitClient.getCurrentBranch();
  } catch (error) {
    if (error instanceof GitError) {
      throw new CodeflowPrError({
        code: 'git_status_failed',
        message: `Could not determine current git branch: ${error.message}`,
        cause: error,
      });
    }

    throw error;
  }
}

async function getStatusOrThrow(gitClient: GitClient): Promise<GitStatus> {
  try {
    return await gitClient.getStatus();
  } catch (error) {
    if (error instanceof GitError) {
      throw new CodeflowPrError({
        code: 'git_status_failed',
        message: `Could not inspect git status: ${error.message}`,
        cause: error,
      });
    }

    throw error;
  }
}

function hasStagedChanges(entry: GitStatusEntry): boolean {
  return entry.indexStatus !== ' ' && entry.indexStatus !== '?';
}

function hasUnstagedChanges(entry: GitStatusEntry): boolean {
  return entry.worktreeStatus !== ' ' || isUntrackedEntry(entry);
}

function isUntrackedEntry(entry: GitStatusEntry): boolean {
  return entry.indexStatus === '?' && entry.worktreeStatus === '?';
}
