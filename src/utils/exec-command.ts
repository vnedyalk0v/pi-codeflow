import { spawn, type ChildProcess } from 'node:child_process';

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
const FORCE_KILL_DELAY_MS = 1000;

interface OutputCapture {
  text: string;
  truncated: boolean;
}

export function execConfiguredCommand(
  command: string,
  options: ExecCommandOptions = {},
): Promise<ExecCommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  const stdout = createOutputCapture();
  const stderr = createOutputCapture();
  let timedOut = false;
  let timeout: NodeJS.Timeout | undefined;
  let forceKillTimeout: NodeJS.Timeout | undefined;
  let settled = false;

  return new Promise((resolve) => {
    const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) {
        return;
      }

      settled = true;

      if (timeout) {
        clearTimeout(timeout);
      }

      if (forceKillTimeout) {
        clearTimeout(forceKillTimeout);
      }

      resolve({
        command,
        cwd,
        exitCode,
        signal,
        stdout: stdout.text,
        stderr: stderr.text,
        timedOut,
      });
    };
    // Codeflow check commands are project-owned config strings such as
    // `npm run lint`. Shell execution stays isolated here and callers must not
    // pass arbitrary user command arguments.
    const child = spawn(command, {
      cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      shell: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      appendOutput(stdout, chunk, maxBufferBytes);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      appendOutput(stderr, chunk, maxBufferBytes);
    });

    child.on('error', (error) => {
      appendOutput(stderr, Buffer.from(`${error.message}\n`), maxBufferBytes);
      finish(null, null);
    });

    if (options.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        timedOut = true;
        terminateProcessTree(child);
        forceKillTimeout = setTimeout(() => {
          terminateProcessTree(child, 'SIGKILL');
        }, FORCE_KILL_DELAY_MS);
      }, options.timeoutMs);
    }

    child.on('close', (exitCode, signal) => {
      finish(exitCode, signal);
    });
  });
}

function createOutputCapture(): OutputCapture {
  return {
    text: '',
    truncated: false,
  };
}

function appendOutput(capture: OutputCapture, chunk: Buffer, maxBytes: number): void {
  if (capture.truncated) {
    return;
  }

  const nextText = `${capture.text}${chunk.toString('utf8')}`;

  if (Buffer.byteLength(nextText, 'utf8') <= maxBytes) {
    capture.text = nextText;
    return;
  }

  capture.text = `${truncateUtf8(nextText, maxBytes)}\n[codeflow output truncated after ${maxBytes} bytes]\n`;
  capture.truncated = true;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let output = '';

  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');

    if (bytes + characterBytes > maxBytes) {
      break;
    }

    bytes += characterBytes;
    output += character;
  }

  return output;
}

function terminateProcessTree(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (child.pid === undefined) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Process already exited.
    }
  }
}
