import type { CodeflowReviewComment } from './review-comment';

export interface CodeflowReviewThread {
  threadId: string;
  prNumber: number;
  path: string | null;
  line: number | null;
  startLine: number | null;
  isResolved: boolean;
  isOutdated: boolean;
  author: string | null;
  authorAssociation: string | null;
  firstComment: CodeflowReviewComment | null;
  comments: CodeflowReviewComment[];
  latestComment: CodeflowReviewComment | null;
  createdAt: string | null;
  updatedAt: string | null;
  url: string | null;
  source: 'github-graphql';
  canResolve: boolean;
  canReply: boolean;
}

export interface CodeflowReviewThreadFilter {
  unresolvedOnly?: boolean;
  includeResolved?: boolean;
  includeOutdated?: boolean;
  authors?: string[];
  includeAuthors?: string[];
  excludeAuthors?: string[];
  paths?: string[];
  maxThreads?: number;
}

export interface CodeflowReviewThreadSummary {
  prNumber: number | null;
  prUrl: string | null;
  mode: 'unresolved threads' | 'all threads';
  fetchedThreadCount: number;
  filteredThreadCount: number;
  classificationCounts: Record<string, number>;
  requiresHumanDecisionCount: number;
  summary: string;
}
