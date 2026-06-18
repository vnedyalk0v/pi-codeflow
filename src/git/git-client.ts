import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GitError } from './git-errors';
import { parseGitStatus, type GitStatus } from './git-status';

const execFileAsync = promisify(execFile);

export interface GitClientOptions {
  cwd?: string;
  timeoutMs?: number;
}

interface GitCommandResult {
  stdout: string;
  stderr: string;
}

export class GitClient {
  readonly cwd: string;
  readonly timeoutMs: number;

  constructor(options: GitClientOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async getRepoRoot(): Promise<string> {
    const result = await this.run(['rev-parse', '--show-toplevel'], {
      errorCode: 'not_git_repository',
    });
    return result.stdout.trim();
  }

  async getCurrentBranch(): Promise<string | null> {
    const result = await this.run(['branch', '--show-current']);
    const branch = result.stdout.trim();
    return branch.length > 0 ? branch : null;
  }

  async getStatus(): Promise<GitStatus> {
    const result = await this.run(['status', '--porcelain=v1']);
    return parseGitStatus(result.stdout);
  }

  async branchExists(branchName: string): Promise<boolean> {
    return this.refExists(`refs/heads/${branchName}`);
  }

  async remoteBranchExists(branchName: string, remote = 'origin'): Promise<boolean> {
    return this.refExists(`refs/remotes/${remote}/${branchName}`);
  }

  async remoteHeadExists(branchName: string, remote = 'origin'): Promise<boolean> {
    return (await this.getRemoteHeadSha(branchName, remote)) !== null;
  }

  async getRemoteHeadSha(branchName: string, remote = 'origin'): Promise<string | null> {
    if (!(await this.remoteExists(remote))) {
      return null;
    }

    try {
      const result = await this.run(['ls-remote', '--exit-code', '--heads', remote, branchName]);
      const [sha] = result.stdout.trim().split(/\s+/, 1);
      return sha && sha.length > 0 ? sha : null;
    } catch (error) {
      if (error instanceof GitError && isExitCode(error.exitCode, 2)) {
        return null;
      }

      throw error;
    }
  }

  async fetchBranch(branchName: string, remote = 'origin'): Promise<boolean> {
    try {
      await this.run([
        'fetch',
        '--quiet',
        remote,
        `${branchName}:refs/remotes/${remote}/${branchName}`,
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async createBranchFromRef(branchName: string, ref: string): Promise<void> {
    await this.run(['branch', branchName, ref]);
  }

  async checkoutBranch(branchName: string): Promise<void> {
    await this.run(['checkout', branchName]);
  }

  async commitWithMessageFile(messageFilePath: string): Promise<void> {
    await this.run(['commit', '--file', messageFilePath]);
  }

  async getLatestCommitSha(): Promise<string> {
    return this.getRefSha('HEAD');
  }

  async getRefSha(ref: string): Promise<string> {
    const result = await this.run(['rev-parse', ref]);
    return result.stdout.trim();
  }

  async getAheadCount(baseRef: string, headRef = 'HEAD'): Promise<number> {
    const result = await this.run(['rev-list', '--count', `${baseRef}..${headRef}`]);
    return Number.parseInt(result.stdout.trim(), 10);
  }

  async pushBranch(branchName: string, remote = 'origin'): Promise<void> {
    await this.run(['push', '-u', remote, `${branchName}:${branchName}`]);
  }

  private async refExists(ref: string): Promise<boolean> {
    try {
      await this.run(['show-ref', '--verify', '--quiet', ref]);
      return true;
    } catch (error) {
      if (error instanceof GitError && isExitCode(error.exitCode, 1)) {
        return false;
      }

      throw error;
    }
  }

  private async remoteExists(remote: string): Promise<boolean> {
    try {
      await this.run(['remote', 'get-url', remote]);
      return true;
    } catch (error) {
      if (error instanceof GitError && isExitCode(error.exitCode, 2)) {
        return false;
      }

      throw error;
    }
  }

  private async run(
    args: string[],
    options: { errorCode?: ConstructorParameters<typeof GitError>[0]['code'] } = {},
  ): Promise<GitCommandResult> {
    try {
      const result = await execFileAsync('git', args, {
        cwd: this.cwd,
        timeout: this.timeoutMs,
        maxBuffer: 1024 * 1024,
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      throw toGitError(error, args, options.errorCode);
    }
  }
}

function isExitCode(value: number | string | undefined, expected: number): boolean {
  return value === expected || value === String(expected);
}

function toGitError(
  error: unknown,
  args: string[],
  code: ConstructorParameters<typeof GitError>[0]['code'] = 'git_command_failed',
): GitError {
  const execError = error as {
    code?: number | string;
    stdout?: string;
    stderr?: string;
    message?: string;
  };
  const stderr = execError.stderr ?? '';
  const stdout = execError.stdout ?? '';
  const message = stderr.trim() || execError.message || `git ${args.join(' ')} failed`;

  return new GitError({
    code,
    message,
    command: 'git',
    args,
    exitCode: execError.code,
    stdout,
    stderr,
    cause: error,
  });
}
