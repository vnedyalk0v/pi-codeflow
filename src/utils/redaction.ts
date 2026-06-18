const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(authorization\s*[:=]\s*bearer\s+)[^\s'\"]+/gi, '$1[REDACTED]'],
  [/(authorization\s*[:=]\s*basic\s+)[^\s'\"]+/gi, '$1[REDACTED]'],
  [
    /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|password|passwd|secret|token)\s*[:=]\s*)(\"[^\"]*\"|'[^']*'|[^\s,;]+)/gi,
    '$1[REDACTED]',
  ],
  [/(\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b)/g, '[REDACTED]'],
  [/(\bgithub_pat_[A-Za-z0-9_]{20,}\b)/g, '[REDACTED]'],
  [/(\bAKIA[0-9A-Z]{16}\b)/g, '[REDACTED]'],
  [/(\bsk-[A-Za-z0-9_-]{20,}\b)/g, '[REDACTED]'],
  [/(\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b)/g, '[REDACTED]'],
];

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}
