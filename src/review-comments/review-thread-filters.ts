import type { CodeflowReviewThread } from './review-thread';
import type { CodeflowReviewThreadFilter } from './review-thread';
import { CodeflowReviewCommentsError } from './review-comments-errors';

export function filterReviewThreads(
  threads: CodeflowReviewThread[],
  filter: CodeflowReviewThreadFilter = {},
): CodeflowReviewThread[] {
  const includeResolved = filter.includeResolved === true;
  const unresolvedOnly = includeResolved ? false : filter.unresolvedOnly !== false;
  const includeOutdated = filter.includeOutdated === true;
  const authorAllowList = normalizeList(filter.authors && filter.authors.length > 0
    ? filter.authors
    : filter.includeAuthors ?? []);
  const authorDenyList = normalizeList(filter.excludeAuthors ?? []);
  const pathFilters = (filter.paths ?? []).map((item) => item.trim()).filter(Boolean);
  const maxThreads = resolveMaxThreads(filter.maxThreads);

  let result = threads.filter((thread) => {
    if (unresolvedOnly && thread.isResolved) {
      return false;
    }

    if (!includeOutdated && thread.isOutdated) {
      return false;
    }

    if (authorAllowList.size > 0 && !matchesAuthor(thread, authorAllowList)) {
      return false;
    }

    if (authorDenyList.size > 0 && matchesAuthor(thread, authorDenyList)) {
      return false;
    }

    if (pathFilters.length > 0 && !matchesPath(thread.path, pathFilters)) {
      return false;
    }

    return true;
  });

  if (maxThreads !== undefined) {
    result = result.slice(0, maxThreads);
  }

  return result;
}

function matchesAuthor(thread: CodeflowReviewThread, authors: Set<string>): boolean {
  const values = [thread.author, ...thread.comments.map((comment) => comment.author)];

  return values.some((value) => value !== null && authors.has(value.toLowerCase()));
}

function matchesPath(path: string | null, filters: string[]): boolean {
  if (path === null) {
    return false;
  }

  return filters.some((filter) => {
    if (filter.endsWith('/')) {
      return path.startsWith(filter);
    }

    return path === filter || path.startsWith(`${filter}/`);
  });
}

function normalizeList(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function resolveMaxThreads(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new CodeflowReviewCommentsError({
      code: 'invalid_arguments',
      message: 'maxThreads must be a positive integer.',
      details: { maxThreads: value },
    });
  }

  return value;
}
