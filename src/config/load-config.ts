import path from 'node:path';

import type { CodeflowConfig } from './codeflow-config';
import { CodeflowConfigLoadError } from './config-errors';
import { getDefaultCodeflowConfig } from './default-config';
import { findCodeflowConfigPath, resolveConfigPath } from './config-paths';
import { mergeCodeflowConfig } from './merge-config';
import { validateCodeflowConfig } from './validate-config';
import { fileExists, readUtf8File } from '../utils/fs';

export interface LoadCodeflowConfigOptions {
  cwd?: string;
  configPath?: string;
  allowMissingProjectConfig?: boolean;
}

export interface LoadCodeflowConfigResult {
  config: CodeflowConfig;
  configPath: string | null;
  usedDefaultConfig: boolean;
  validationWarnings: string[];
}

export async function loadCodeflowConfig(
  options: LoadCodeflowConfigOptions = {},
): Promise<LoadCodeflowConfigResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const defaultConfig = getDefaultCodeflowConfig();
  const configPath = options.configPath
    ? resolveConfigPath(options.configPath, cwd)
    : await findCodeflowConfigPath({ cwd });

  if (configPath === null) {
    if (options.allowMissingProjectConfig === false) {
      throw new CodeflowConfigLoadError({
        code: 'project_config_not_found',
        message: `Project config .pi/codeflow.json was not found from ${cwd}`,
      });
    }

    return validateResolvedConfig(defaultConfig, null, true);
  }

  if (options.configPath && !(await fileExists(configPath))) {
    throw new CodeflowConfigLoadError({
      code: 'file_not_found',
      path: configPath,
      message: `Codeflow config file was not found: ${configPath}`,
    });
  }

  const projectConfig = await readProjectConfig(configPath);

  const mergedConfig = mergeCodeflowConfig(
    defaultConfig,
    projectConfig as Record<string, unknown>,
  );
  return validateResolvedConfig(mergedConfig, configPath, false);
}

async function readProjectConfig(configPath: string): Promise<unknown> {
  let text: string;

  try {
    text = await readUtf8File(configPath);
  } catch (error) {
    throw new CodeflowConfigLoadError({
      code: 'unreadable_file',
      path: configPath,
      message: `Codeflow config file could not be read: ${configPath}`,
      cause: error,
    });
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new CodeflowConfigLoadError({
      code: 'invalid_json',
      path: configPath,
      message: `Codeflow config file contains invalid JSON: ${configPath}`,
      cause: error,
    });
  }
}

function validateResolvedConfig(
  config: unknown,
  configPath: string | null,
  usedDefaultConfig: boolean,
): LoadCodeflowConfigResult {
  const validation = validateCodeflowConfig(config);

  if (!validation.valid) {
    throw new CodeflowConfigLoadError({
      code: 'validation_failed',
      path: configPath ?? undefined,
      message: 'Resolved Codeflow config failed schema validation.',
      validationErrors: validation.errors,
    });
  }

  return {
    config: validation.config,
    configPath,
    usedDefaultConfig,
    validationWarnings: validation.warnings,
  };
}
