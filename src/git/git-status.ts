export interface GitStatusEntry {
  indexStatus: string;
  worktreeStatus: string;
  path: string;
}

export interface GitStatus {
  clean: boolean;
  raw: string;
  entries: GitStatusEntry[];
}

export function parseGitStatus(raw: string): GitStatus {
  const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
  const entries = lines.map((line) => ({
    indexStatus: line[0] ?? ' ',
    worktreeStatus: line[1] ?? ' ',
    path: line.slice(3),
  }));

  return {
    clean: entries.length === 0,
    raw,
    entries,
  };
}
