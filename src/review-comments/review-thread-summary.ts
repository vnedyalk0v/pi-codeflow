import type { CodeflowReviewThread } from './review-thread';
import type { CodeflowReviewCommentTriageResult } from './review-thread-triage';
import { CODEFLOW_REVIEW_COMMENT_CLASSIFICATIONS } from './review-thread-triage';
import { redactSecrets, stripAnsi } from '../utils/redaction';

const MAX_THREAD_LINES = 20;
const MAX_BODY_SUMMARY_CHARS = 140;

export interface SummarizeReviewThreadsInput {
  prNumber: number | null;
  prUrl?: string | null;
  threads: CodeflowReviewThread[];
  filteredThreads?: CodeflowReviewThread[];
  unresolvedOnly?: boolean;
  includeOutdated?: boolean;
  triage?: CodeflowReviewCommentTriageResult | null;
}

export function summarizeReviewThreads(input: SummarizeReviewThreadsInput): string {
  const filteredThreads = input.filteredThreads ?? input.threads;
  const mode = input.unresolvedOnly === false ? 'all threads' : 'unresolved threads';

  if (input.triage?.valid) {
    return summarizeTriage({ ...input, filteredThreads, mode, triage: input.triage });
  }

  if (filteredThreads.length === 0) {
    return [
      'Codeflow review comments: no unresolved review threads found.',
      '',
      `PR: ${formatPr(input.prNumber)}`,
      `Mode: ${mode}`,
      `Threads fetched: ${input.threads.length}`,
      'Threads checked: 0',
      `Include outdated: ${input.includeOutdated === true ? 'yes' : 'no'}`,
      '',
      'Next expected action:',
      'Continue to final reporting when verification evidence is complete.',
    ].join('\n');
  }

  const lines = [
    'Codeflow review comments found.',
    '',
    `PR: ${formatPr(input.prNumber)}`,
    `Mode: ${mode}`,
    `Threads fetched: ${input.threads.length}`,
    `Threads: ${filteredThreads.length}`,
    `Include outdated: ${input.includeOutdated === true ? 'yes' : 'no'}`,
    '',
    'Threads:',
    ...filteredThreads.slice(0, MAX_THREAD_LINES).flatMap(formatThreadSummaryLines),
  ];

  if (filteredThreads.length > MAX_THREAD_LINES) {
    lines.push(`- ${filteredThreads.length - MAX_THREAD_LINES} additional thread(s) omitted from summary.`);
  }

  lines.push(
    '',
    'Next expected action:',
    'Classify each thread as valid, invalid, stale, already_fixed, or needs_human. Do not reply or resolve in this read-only command.',
  );

  return lines.join('\n');
}

export function summarizeReviewCommentBody(body: string, maxChars = MAX_BODY_SUMMARY_CHARS): string {
  const compact = redactSecrets(stripAnsi(body))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  if (compact.length === 0) {
    return 'No comment body.';
  }

  if (compact.length <= maxChars) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function summarizeTriage(input: Omit<SummarizeReviewThreadsInput, 'triage'> & {
  filteredThreads: CodeflowReviewThread[];
  mode: string;
  triage: CodeflowReviewCommentTriageResult;
}): string {
  const { triage } = input;
  const lines = [
    'Codeflow review comments triage summary.',
    '',
    `PR: ${formatPr(input.prNumber)}`,
    `Mode: ${input.mode}`,
    `Threads fetched: ${input.threads.length}`,
    `Threads checked: ${input.filteredThreads.length}`,
    `Threads triaged: ${triage.threadCount}`,
    '',
    'Classifications:',
    ...CODEFLOW_REVIEW_COMMENT_CLASSIFICATIONS.map(
      (classification) => `- ${classification}: ${triage.classificationCounts[classification]}`,
    ),
  ];

  if (triage.requiresHumanDecisionCount > 0) {
    lines.push(
      '',
      'Blocking:',
      `- ${triage.requiresHumanDecisionCount} thread(s) require human decision.`,
    );
  }

  lines.push(
    '',
    'Next expected action:',
    triage.requiresHumanDecisionCount > 0
      ? 'Ask for the required human decision before changing code, replying, or resolving review threads.'
      : 'For valid findings, fix the code, run `/flow-check`, commit through `/flow-commit`, and re-run `/flow-watch`. Reply/resolve behavior will be implemented in `/flow-fix-comments`.',
  );

  return lines.join('\n');
}

function formatThreadSummaryLines(thread: CodeflowReviewThread): string[] {
  const location = formatThreadLocation(thread);
  const author = thread.author ?? 'unknown author';
  const resolution = thread.isResolved ? 'resolved' : 'unresolved';
  const outdated = thread.isOutdated ? ', outdated' : '';
  const body = summarizeReviewCommentBody(thread.latestComment?.body ?? thread.firstComment?.body ?? '');

  return [
    `- ${location} — ${author} — ${resolution}${outdated}`,
    `  Summary: ${body}`,
  ];
}

function formatThreadLocation(thread: CodeflowReviewThread): string {
  const path = thread.path ?? 'unknown path';

  if (thread.line !== null) {
    return `${path}:${thread.line}`;
  }

  if (thread.startLine !== null) {
    return `${path}:${thread.startLine}`;
  }

  return path;
}

function formatPr(prNumber: number | null): string {
  return prNumber === null ? 'unknown' : `#${prNumber}`;
}
