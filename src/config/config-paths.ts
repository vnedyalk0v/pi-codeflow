import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fileExists } from '../utils/fs';

export const CODEFLOW_CONFIG_RELATIVE_PATH = path.join('.pi', 'codeflow.json');

export interface FindCodeflowConfigPathOptions {
  cwd?: string;
}

export async function findCodeflowConfigPath(
  options: FindCodeflowConfigPathOptions | string = {},
): Promise<string | null> {
  const cwd = typeof options === 'string' ? options : options.cwd;
  let currentDir = path.resolve(cwd ?? process.cwd());

  while (true) {
    const candidate = path.join(currentDir, CODEFLOW_CONFIG_RELATIVE_PATH);

    if (await fileExists(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

export function resolveConfigPath(configPath: string, cwd = process.cwd()): string {
  return path.isAbsolute(configPath) ? configPath : path.resolve(cwd, configPath);
}

export function getDefaultConfigPath(): string {
  return fileURLToPath(new URL('../../config/default.codeflow.json', import.meta.url));
}

export function getCodeflowSchemaPath(): string {
  return fileURLToPath(new URL('../../schemas/codeflow.schema.json', import.meta.url));
}
