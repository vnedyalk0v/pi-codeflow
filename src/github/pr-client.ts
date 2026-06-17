import { parseJson } from '../utils/json';
import { withTempFile } from '../utils/temp-file';
import { truncateText } from '../utils/text';
import { CodeflowPrError } from '../pull-requests/pr-errors';
import { GhClient, type GhClientLike } from './gh-client';
import { GithubCliError } from './github-errors';

export interface CreateGitHubPullRequestOptions {
  cwd?: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
  draft?: boolean;
  draftOverride?: boolean;
  updateExisting?: boolean;
  ghClient?: GhClientLike;
}

export interface GitHubPullRequestResult {
  url: string;
  number: number | null;
  baseBranch: string;
  headBranch: string;
  title: string;
  draft: boolean;
  created: boolean;
  updatedExisting: boolean;
  warnings: string[];
}

interface ExistingPrView {
  url?: string;
  number?: number;
  baseRefName?: string;
  headRefName?: string;
  title?: string;
  isDraft?: boolean;
}

export async function createGitHubPullRequest(
  options: CreateGitHubPullRequestOptions,
): Promise<GitHubPullRequestResult> {
  const ghClient = options.ghClient ?? new GhClient({ cwd: options.cwd });

  return withTempFile('codeflow-pr-', `${options.body.trimEnd()}\n`, async (bodyFilePath) => {
    const createArgs = buildCreatePullRequestArgs({ ...options, bodyFilePath });

    try {
      const result = await ghClient.run(createArgs);
      const url = parsePullRequestUrl(`${result.stdout}\n${result.stderr}`);

      if (!url) {
        throw new CodeflowPrError({
          code: 'gh_pr_create_failed',
          message: 'GitHub CLI did not return a pull request URL.',
          details: {
            stdout: truncateText(result.stdout, 1000),
            stderr: truncateText(result.stderr, 1000),
          },
        });
      }

      return {
        url,
        number: parsePullRequestNumber(url),
        baseBranch: options.baseBranch,
        headBranch: options.headBranch,
        title: options.title,
        draft: options.draft === true,
        created: true,
        updatedExisting: false,
        warnings: [],
      };
    } catch (error) {
      if (error instanceof GithubCliError) {
        return handleGithubCreateError(error, ghClient, options, bodyFilePath);
      }

      throw error;
    }
  });
}

export function buildCreatePullRequestArgs(options: {
  baseBranch: string;
  headBranch: string;
  title: string;
  bodyFilePath: string;
  draft?: boolean;
}): string[] {
  const args = [
    'pr',
    'create',
    '--base',
    options.baseBranch,
    '--head',
    options.headBranch,
    '--title',
    options.title,
    '--body-file',
    options.bodyFilePath,
  ];

  if (options.draft) {
    args.push('--draft');
  }

  return args;
}

async function handleGithubCreateError(
  error: GithubCliError,
  ghClient: GhClientLike,
  options: CreateGitHubPullRequestOptions,
  bodyFilePath: string,
): Promise<GitHubPullRequestResult> {
  if (error.code === 'gh_missing') {
    throw new CodeflowPrError({
      code: 'gh_missing',
      message: error.message,
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (error.code === 'gh_auth_required') {
    throw new CodeflowPrError({
      code: 'gh_auth_required',
      message: error.message,
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  if (!looksLikeExistingPrError(`${error.stdout}\n${error.stderr}\n${error.message}`)) {
    throw new CodeflowPrError({
      code: 'gh_pr_create_failed',
      message: `gh pr create failed: ${error.message}`,
      details: githubErrorDetails(error),
      cause: error,
    });
  }

  const existingUrl = parsePullRequestUrl(`${error.stdout}\n${error.stderr}\n${error.message}`);

  if (options.updateExisting === false) {
    throw new CodeflowPrError({
      code: 'pr_already_exists',
      message: existingUrl
        ? `A pull request already exists for ${options.headBranch}: ${existingUrl}`
        : `A pull request already exists for ${options.headBranch}; use the existing PR or enable updateExisting.`,
      details: { ...githubErrorDetails(error), existingUrl },
      cause: error,
    });
  }

  const existing = await viewExistingPullRequest(ghClient, options.headBranch, existingUrl);
  await editExistingPullRequest(ghClient, existing.url, options.title, bodyFilePath);
  const draftUpdate = await updateExistingPullRequestDraftState(
    ghClient,
    existing.url,
    existing.isDraft,
    options.draftOverride,
  );
  const warnings = [
    `Pull request already exists for ${options.headBranch}; updated title/body on ${existing.url}.`,
    ...draftUpdate.warnings,
  ];

  return {
    url: existing.url,
    number: existing.number ?? parsePullRequestNumber(existing.url),
    baseBranch: existing.baseRefName ?? options.baseBranch,
    headBranch: existing.headRefName ?? options.headBranch,
    title: options.title,
    draft: draftUpdate.draft ?? existing.isDraft ?? options.draft === true,
    created: false,
    updatedExisting: true,
    warnings,
  };
}

async function viewExistingPullRequest(
  ghClient: GhClientLike,
  headBranch: string,
  fallbackUrl: string | null,
): Promise<Required<Pick<ExistingPrView, 'url'>> & ExistingPrView> {
  try {
    const result = await ghClient.run([
      'pr',
      'list',
      '--head',
      headBranch,
      '--json',
      'url,number,baseRefName,headRefName,title,isDraft',
      '--limit',
      '1',
    ]);
    const parsed = parseJson(result.stdout) as ExistingPrView[];
    const existingPr = Array.isArray(parsed) ? parsed[0] : undefined;

    if (typeof existingPr?.url === 'string' && existingPr.url.length > 0) {
      return existingPr as Required<Pick<ExistingPrView, 'url'>> & ExistingPrView;
    }
  } catch (error) {
    if (error instanceof GithubCliError && fallbackUrl) {
      return { url: fallbackUrl };
    }

    if (error instanceof GithubCliError) {
      throw new CodeflowPrError({
        code: 'pr_already_exists',
        message: `A pull request already exists for ${headBranch}, but Codeflow could not discover its URL.`,
        details: githubErrorDetails(error),
        cause: error,
      });
    }

    throw error;
  }

  if (fallbackUrl) {
    return { url: fallbackUrl };
  }

  throw new CodeflowPrError({
    code: 'pr_already_exists',
    message: `A pull request already exists for ${headBranch}, but Codeflow could not discover its URL.`,
  });
}

async function editExistingPullRequest(
  ghClient: GhClientLike,
  url: string,
  title: string,
  bodyFilePath: string,
): Promise<void> {
  try {
    await ghClient.run(['pr', 'edit', url, '--title', title, '--body-file', bodyFilePath]);
  } catch (error) {
    if (error instanceof GithubCliError) {
      throw new CodeflowPrError({
        code: 'gh_pr_update_failed',
        message: `gh pr edit failed: ${error.message}`,
        details: githubErrorDetails(error),
        cause: error,
      });
    }

    throw error;
  }
}

async function updateExistingPullRequestDraftState(
  ghClient: GhClientLike,
  url: string,
  currentDraft: boolean | undefined,
  draftOverride: boolean | undefined,
): Promise<{ draft?: boolean; warnings: string[] }> {
  if (draftOverride === undefined) {
    return { draft: currentDraft, warnings: [] };
  }

  if (currentDraft === draftOverride) {
    return { draft: draftOverride, warnings: [] };
  }

  const args = ['pr', 'ready', url];

  if (draftOverride) {
    args.push('--undo');
  }

  try {
    await ghClient.run(args);
  } catch (error) {
    if (error instanceof GithubCliError) {
      throw new CodeflowPrError({
        code: 'gh_pr_update_failed',
        message: `gh pr ready failed: ${error.message}`,
        details: githubErrorDetails(error),
        cause: error,
      });
    }

    throw error;
  }

  return {
    draft: draftOverride,
    warnings: [
      draftOverride
        ? `Converted existing PR ${url} to draft.`
        : `Marked existing PR ${url} ready for review.`,
    ],
  };
}

function looksLikeExistingPrError(value: string): boolean {
  return /pull request.*already exists|already.*pull request/i.test(value);
}

function parsePullRequestUrl(value: string): string | null {
  const candidates = value.match(/https?:\/\/\S+/g) ?? [];

  for (const rawCandidate of candidates) {
    const candidate = rawCandidate.replace(/[),.;\]]+$/u, '');

    try {
      const url = new URL(candidate);

      if (/\/pull\/\d+\/?$/u.test(url.pathname)) {
        return candidate;
      }
    } catch {
      // Ignore non-URL tokens and keep scanning gh output.
    }
  }

  return null;
}

function parsePullRequestNumber(url: string): number | null {
  const value = url.match(/\/pull\/(\d+)(?:$|[?#])/)?.[1];
  return value ? Number.parseInt(value, 10) : null;
}

function githubErrorDetails(error: GithubCliError): Record<string, unknown> {
  return {
    args: error.args,
    exitCode: error.exitCode ?? null,
    stdout: truncateText(error.stdout, 1000),
    stderr: truncateText(error.stderr, 1000),
  };
}
