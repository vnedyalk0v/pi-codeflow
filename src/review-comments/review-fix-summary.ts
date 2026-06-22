import type {
  CodeflowReviewFixBlockedItem,
  CodeflowReviewReplyResult,
  CodeflowReviewResolutionResult,
  CodeflowReviewFixResultStatus,
} from './review-fix-payload';

export interface SummarizeReviewFixInput {
  status: CodeflowReviewFixResultStatus;
  prNumber: number | null;
  replies: CodeflowReviewReplyResult[];
  resolutions: CodeflowReviewResolutionResult[];
  blocked: CodeflowReviewFixBlockedItem[];
  requiresHumanDecision: string[];
  warnings: string[];
  dryRun: boolean;
  applyReplies: boolean;
  applyResolutions: boolean;
}

export function summarizeReviewFix(input: SummarizeReviewFixInput): string {
  const postedReplies = input.replies.filter((reply) => reply.status === 'posted');
  const plannedReplies = input.replies.filter((reply) => reply.status === 'planned');
  const resolvedThreads = input.resolutions.filter((resolution) => resolution.status === 'resolved');
  const plannedResolutions = input.resolutions.filter((resolution) => resolution.status === 'planned');
  const skippedReplies = input.replies.filter((reply) => reply.status === 'skipped');
  const skippedResolutions = input.resolutions.filter((resolution) => resolution.status === 'skipped');

  const lines = [
    input.dryRun ? 'Codeflow review fix dry-run.' : 'Codeflow review fix result.',
    '',
    `Status: ${input.status}`,
    `PR: ${input.prNumber === null ? 'unknown' : `#${input.prNumber}`}`,
    `Apply replies: ${input.applyReplies ? 'yes' : 'no'}`,
    `Apply resolutions: ${input.applyResolutions ? 'yes' : 'no'}`,
    '',
    'Outcomes:',
    `- replies posted: ${postedReplies.length}`,
    `- replies planned: ${plannedReplies.length}`,
    `- threads resolved: ${resolvedThreads.length}`,
    `- resolutions planned: ${plannedResolutions.length}`,
    `- blocked: ${input.blocked.length}`,
    `- human decisions required: ${input.requiresHumanDecision.length}`,
    `- skipped replies: ${skippedReplies.length}`,
    `- skipped resolutions: ${skippedResolutions.length}`,
  ];

  if (input.blocked.length > 0) {
    lines.push('', 'Blocked threads:');
    for (const item of input.blocked.slice(0, 20)) {
      lines.push(`- ${item.threadId} (${item.classification}): ${item.reason}`);
    }

    if (input.blocked.length > 20) {
      lines.push(`- ${input.blocked.length - 20} additional blocked thread(s) omitted from summary.`);
    }
  }

  if (input.requiresHumanDecision.length > 0) {
    lines.push('', 'Human decisions required:', ...input.requiresHumanDecision.slice(0, 20).map((threadId) => `- ${threadId}`));
  }

  lines.push('', 'Next expected actions:');

  if (input.requiresHumanDecision.length > 0) {
    lines.push('- Ask a maintainer for the required review-thread decisions before continuing.');
  } else if (input.blocked.length > 0) {
    lines.push('- Address blocked verification or policy reasons, then rerun /flow-fix-comments.');
  } else if (input.dryRun) {
    lines.push('- Review the planned replies/resolutions, then rerun with --apply-replies, --apply-resolutions, or --apply.');
  } else {
    lines.push('- Rerun /flow-comments to confirm remaining unresolved review threads before final reporting.');
  }

  if (input.warnings.length > 0) {
    lines.push('', 'Warnings:', ...input.warnings.map((warning) => `- ${warning}`));
  }

  return lines.join('\n');
}
