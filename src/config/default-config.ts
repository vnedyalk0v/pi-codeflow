import { readFileSync } from 'node:fs';

import type { CodeflowConfig } from './codeflow-config';
import { getDefaultConfigPath } from './config-paths';

let cachedDefaultConfig: CodeflowConfig | null = null;

export function getDefaultCodeflowConfig(): CodeflowConfig {
  cachedDefaultConfig ??= readDefaultCodeflowConfig();
  return structuredClone(cachedDefaultConfig);
}

function readDefaultCodeflowConfig(): CodeflowConfig {
  const text = readFileSync(getDefaultConfigPath(), 'utf8');
  return JSON.parse(text) as CodeflowConfig;
}
