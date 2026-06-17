import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import { GitClient } from '../git/git-client';
import { GitError } from '../git/git-errors';
import type { GitStatus, GitStatusEntry } from '../git/git-status';
import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import { isReservedBranch } from '../safety/reserved-branch-policy';
import type { CodeflowSessionState } from '../state/session-state';
import { withTempFile } from '../utils/temp-file';
import { truncateText } from '../utils/text';
import { validateCommitPayload } from './commit-payload-validation';
import { CodeflowCommitError } from './commit-errors';
import type {
  CodeflowCommitMessage,
  CodeflowCommitPayload,
  CodeflowCommitResult,
} from './commit-payload';
import { renderCommitMessage } from './commit-message-renderer';

export interface CreateGitCommitFromPayloadOptions {
  cwd?: string;
  payload: CodeflowCommitPayload;
  dryRun?: boolean;
  allowUnverified?: boolean;
  allowReservedBranch?: boolean;
  config?: CodeflowConfig;
  gitClient?: GitClient;
  sessionState?: CodeflowSessionState;
  templateCwd?: string;
}

interface CommitSafetyResult {
  branch: string | null;
  warnings: string[];
}

export async function createGitCommitFromPayload(
  options: CreateGitCommitFromPayloadOptions,
): Promise<CodeflowCommitResult> {
  const cwd = options.cwd ?? process.cwd();
  const templateCwd = options.templateCwd ?? cwd;
  const config = options.config ?? getDefaultCodeflowConfig();
  const gitClient = options.gitClient ?? new GitClient({ cwd });
  const allowUnverifiedPayload =
    options.allowUnverified === true || config.commits.allowUnverifiedCommits;
  const validation = validateCommitPayload(options.payload, {
    config,
    allowUnverified: allowUnverifiedPayload,
  });

  if (!validation.valid) {
    throw new CodeflowCommitError({
      code: 'invalid_payload',
      message: 'Commit payload failed validation.',
      validationErrors: validation.errors,
    });
  }

  const safety = await evaluateCommitSafety({
    config,
    gitClient,
    sessionState: options.sessionState,
    allowReservedBranch: options.allowReservedBranch === true,
    allowUnverified: options.allowUnverified === true,
    dryRun: options.dryRun === true,
  });
  const rendered = await renderCommitMessage(validation.payload, { cwd: templateCwd, config });
  const warnings = [...validation.warnings, ...safety.warnings, ...rendered.warnings];

  if (options.dryRun) {
    return makeCommitResult({
      status: 'dry_run',
      commitSha: null,
      branch: safety.branch,
      rendered,
      payload: validation.payload,
      warnings,
      validationWarnings: validation.warnings,
      lifecyclePhase: 'ready_to_commit',
    });
  }

  if (!config.commits.performCommit) {
    throw new CodeflowCommitError({
      code: 'commit_disabled',
      message: 'Codeflow config disables performing git commits.',
    });
  }

  const commitSha = await commitRenderedMessage(gitClient, rendered.message);

  return makeCommitResult({
    status: 'committed',
    commitSha,
    branch: safety.branch,
    rendered,
    payload: validation.payload,
    warnings,
    validationWarnings: validation.warnings,
    lifecyclePhase: 'committed',
  });
}

async function evaluateCommitSafety(options: {
  config: CodeflowConfig;
  gitClient: GitClient;
  sessionState?: CodeflowSessionState;
  allowReservedBranch: boolean;
  allowUnverified: boolean;
  dryRun: boolean;
}): Promise<CommitSafetyResult> {
  const warnings: string[] = [];
  const branch = await getCurrentBranchOrThrow(options.gitClient);

  validateReservedBranchPolicy({
    branch,
    config: options.config,
    allowReservedBranch: options.allowReservedBranch,
    warnings,
  });

  const status = await getStatusOrThrow(options.gitClient);
  validateStagedChanges(status, warnings);
  validateCheckState({
    config: options.config,
    sessionState: options.sessionState,
    allowUnverified: options.allowUnverified,
    dryRun: options.dryRun,
    warnings,
  });

  return { branch, warnings };
}

function validateReservedBranchPolicy(options: {
  branch: string | null;
  config: CodeflowConfig;
  allowReservedBranch: boolean;
  warnings: string[];
}): void {
  if (!isReservedBranch(options.branch, options.config)) {
    return;
  }

  if (options.allowReservedBranch && options.config.emergency.allowReservedBranchWork) {
    options.warnings.push(
      `Committing on reserved branch ${options.branch} because explicit override and emergency policy allow it.`,
    );
    return;
  }

  throw new CodeflowCommitError({
    code: 'reserved_branch',
    message: `Refusing to commit on reserved branch ${options.branch}.`,
    details: {
      branch: options.branch,
      allowReservedBranch: options.allowReservedBranch,
      allowReservedBranchWork: options.config.emergency.allowReservedBranchWork,
    },
  });
}

function validateStagedChanges(status: GitStatus, warnings: string[]): void {
  const stagedEntries = status.entries.filter(hasStagedChanges);

  if (stagedEntries.length === 0) {
    throw new CodeflowCommitError({
      code: 'no_staged_changes',
      message: 'No staged changes found. Stage intended files before running /flow-commit.',
      details: { entries: status.entries },
    });
  }

  const unstagedEntries = status.entries.filter(hasUnstagedChanges);
  const untrackedEntries = status.entries.filter(isUntrackedEntry);

  if (unstagedEntries.length > 0) {
    warnings.push('Unstaged changes are present and will not be committed.');
  }

  if (untrackedEntries.length > 0) {
    warnings.push('Untracked files are present and will not be committed unless staged.');
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
      allow: options.allowUnverified || options.config.commits.allowUnverifiedCommits,
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
      options.config.commits.allowUnverifiedCommits ||
      !options.config.commits.requirePassedChecksBeforeCommit,
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

  throw new CodeflowCommitError({
    code: options.code,
    message: options.message,
  });
}

async function commitRenderedMessage(gitClient: GitClient, message: string): Promise<string> {
  try {
    await withTempFile('codeflow-commit-', `${message.trimEnd()}\n`, async (filePath) => {
      await gitClient.commitWithMessageFile(filePath);
    });
    return await gitClient.getLatestCommitSha();
  } catch (error) {
    if (error instanceof GitError) {
      throw new CodeflowCommitError({
        code: 'git_commit_failed',
        message: `git commit failed: ${error.message}`,
        details: {
          exitCode: error.exitCode ?? null,
          stderr: truncateText(error.stderr ?? '', 1000),
          stdout: truncateText(error.stdout ?? '', 1000),
        },
        cause: error,
      });
    }

    throw error;
  }
}

function makeCommitResult(options: {
  status: CodeflowCommitResult['status'];
  commitSha: string | null;
  branch: string | null;
  rendered: CodeflowCommitMessage;
  payload: CodeflowCommitPayload;
  warnings: string[];
  validationWarnings: string[];
  lifecyclePhase: CodeflowLifecyclePhase;
}): CodeflowCommitResult {
  return {
    status: options.status,
    commitSha: options.commitSha,
    branch: options.branch,
    title: options.rendered.title,
    message: options.rendered.message,
    payload: options.payload,
    warnings: options.warnings,
    validationWarnings: options.validationWarnings,
    lifecyclePhase: options.lifecyclePhase,
  };
}

async function getCurrentBranchOrThrow(gitClient: GitClient): Promise<string | null> {
  try {
    return await gitClient.getCurrentBranch();
  } catch (error) {
    if (error instanceof GitError) {
      throw new CodeflowCommitError({
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
      throw new CodeflowCommitError({
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
