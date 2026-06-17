import { readFileSync } from 'node:fs';

import type { CodeflowConfig } from './codeflow-config';
import { getDefaultConfigPath } from './config-paths';
import { cloneJson, parseJson } from '../utils/json';

let cachedDefaultConfig: CodeflowConfig | null = null;

export function getDefaultCodeflowConfig(): CodeflowConfig {
  cachedDefaultConfig ??= readDefaultCodeflowConfig();
  return cloneJson(cachedDefaultConfig);
}

function readDefaultCodeflowConfig(): CodeflowConfig {
  const text = readFileSync(getDefaultConfigPath(), 'utf8');
  return parseJson(text) as CodeflowConfig;
}
