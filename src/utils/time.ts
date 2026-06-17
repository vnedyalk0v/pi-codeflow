export function nowIso(): string {
  return new Date().toISOString();
}

export function elapsedMs(startedAtMs: number, finishedAtMs = Date.now()): number {
  return Math.max(0, finishedAtMs - startedAtMs);
}

export function formatDurationMs(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '0ms';
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }

  const seconds = durationMs / 1000;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}
