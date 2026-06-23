import type { CodeflowConfig } from './codeflow-config';
import { isPlainObject } from '../utils/json';

export function mergeCodeflowConfig(
  defaultConfig: CodeflowConfig,
  projectConfig: Partial<CodeflowConfig>,
): CodeflowConfig;
export function mergeCodeflowConfig(
  defaultConfig: CodeflowConfig,
  projectConfig: Record<string, unknown>,
): CodeflowConfig;
export function mergeCodeflowConfig(
  defaultConfig: CodeflowConfig,
  projectConfig: unknown,
): CodeflowConfig {
  return mergeValues(defaultConfig, projectConfig) as CodeflowConfig;
}

function mergeValues(defaultValue: unknown, projectValue: unknown): unknown {
  if (projectValue === undefined) {
    return structuredClone(defaultValue);
  }

  if (isPlainObject(defaultValue) && isPlainObject(projectValue)) {
    const merged: Record<string, unknown> = structuredClone(defaultValue);

    for (const [key, value] of Object.entries(projectValue)) {
      const currentValue = Object.hasOwn(merged, key) ? merged[key] : undefined;

      Object.defineProperty(merged, key, {
        value: mergeValues(currentValue, value),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }

    return merged;
  }

  return structuredClone(projectValue);
}
