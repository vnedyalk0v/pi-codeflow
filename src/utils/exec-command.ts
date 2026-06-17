import { exec, type ExecException } from 'node:child_process';

export interface ExecCommandOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxBufferBytes?: number;
}

export interface ExecCommandResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const DEFAULT_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export function execConfiguredCommand(
  command: string,
  options: ExecCommandOptions = {},
): Promise<ExecCommandResult> {
  const cwd = options.cwd ?? process.cwd();

  return new Promise((resolve) => {
    // Codeflow check commands are project-owned config strings such as
    // `npm run lint`. Shell execution stays isolated here and callers must not
    // pass arbitrary user command arguments.
    exec(
      command,
      {
        cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        timeout: options.timeoutMs,
        maxBuffer: options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES,
      },
      (error: ExecException | null, stdout, stderr) => {
        const exitCode = getExitCode(error);
        const signal = getSignal(error);
        const timedOut = error?.killed === true && options.timeoutMs !== undefined;

        resolve({
          command,
          cwd,
          exitCode: error ? exitCode : 0,
          signal,
          stdout,
          stderr,
          timedOut,
        });
      },
    );
  });
}

function getExitCode(error: ExecException | null): number | null {
  if (!error) {
    return 0;
  }

  return typeof error.code === 'number' ? error.code : null;
}

function getSignal(error: ExecException | null): string | null {
  if (!error) {
    return null;
  }

  return typeof error.signal === 'string' ? error.signal : null;
}
