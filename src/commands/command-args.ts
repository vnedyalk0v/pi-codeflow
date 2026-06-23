import path from 'node:path';

type InvalidArgumentErrorFactory = (
  message: string,
  details?: Record<string, unknown>,
) => Error;

export function splitCommandArguments(
  args: string,
  commandName: string,
  invalidArgumentError: InvalidArgumentErrorFactory,
): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const character of args) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (escaping) {
    current += '\\';
  }

  if (quote) {
    throw invalidArgumentError(`Unterminated quote in ${commandName} arguments.`);
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

export function readFlagValue(
  tokens: string[],
  index: number,
  flagName: string,
  invalidArgumentError: InvalidArgumentErrorFactory,
): string {
  const value = tokens[index + 1];

  if (!value || value.startsWith('--')) {
    throw invalidArgumentError(`${flagName} requires a value.`, { flagName });
  }

  return value;
}

export function parsePositiveInteger(
  value: string,
  flagName: string,
  invalidArgumentError: InvalidArgumentErrorFactory,
  maxValue?: number,
): number {
  const parsed = Number.parseInt(value, 10);

  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed <= 0) {
    throw invalidArgumentError(`${flagName} requires a positive integer value.`, {
      flagName,
      value,
    });
  }

  if (maxValue !== undefined && parsed > maxValue) {
    throw invalidArgumentError(`${flagName} must be less than or equal to ${maxValue}.`, {
      flagName,
      value,
      maximum: maxValue,
    });
  }

  return parsed;
}

export function resolveCommandBaseCwd(cwd: string, configPath: string | null): string {
  return configPath === null ? cwd : path.dirname(path.dirname(configPath));
}
