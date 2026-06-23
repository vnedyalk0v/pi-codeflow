import type { CodeflowConfig } from '../config/codeflow-config';
import {
  assertCodeflowLifecyclePhase,
  type CodeflowLifecyclePhase,
} from './lifecycle-phase';
import type { CodeflowLifecycleState } from './lifecycle-state';

export function getNextExpectedActions(
  state: CodeflowLifecycleState,
  config: CodeflowConfig,
): string[] {
  const phase = assertCodeflowLifecyclePhase(state.phase);
  const baseBranch = state.baseBranch ?? config.baseBranches.default;
  const workBranch = state.workBranch ?? 'the prepared work branch';

  switch (phase) {
    case 'idle':
      return [
        'Wait for a task or issue before mutating files.',
        'When work starts, use /flow-start to prepare a semantic work branch.',
      ];
    case 'initialized':
      return [
        `Confirm task scope, lifecycle constraints, and base branch ${baseBranch}.`,
        'Prepare the semantic work branch with /flow-start; do not invent branch format manually.',
      ];
    case 'branch_prepared':
      return [
        `Continue only on ${workBranch}; do not perform normal work on reserved branches.`,
        'Provide a structured plan when the task is not straightforward.',
      ];
    case 'planning':
      return [
        'Produce an implementation plan with files, checks, risks, and rollback notes.',
        'Move to implementation only after the plan is accepted or the task is clearly straightforward.',
      ];
    case 'implementing':
      return [
        'Make focused code or documentation changes that match the accepted task scope.',
        'After changes, move toward configured local checks and self-review.',
      ];
    case 'local_checks':
      return getLocalCheckActions(config);
    case 'self_review':
      return [
        'Review the diff for task fit, tests, docs, safety, and regressions.',
        'Move to ready_to_commit only when findings are fixed or intentionally documented.',
      ];
    case 'fixing_local_findings':
      return [
        'Fix only the failed check or self-review findings that are in scope.',
        'Re-run the relevant configured checks before continuing.',
      ];
    case 'ready_to_commit':
      return [
        'Provide a structured commit payload instead of freeform commit text.',
        `Let Codeflow render the commit message from ${config.commits.template}.`,
        'Use /flow-commit to create a commit from staged changes; do not push or open a PR from this step.',
      ];
    case 'committed':
      return [
        'Prepare a structured pull request payload and preserve the existing commit history.',
        `Use /flow-pr to render and open a PR against configured base branch ${config.pullRequest.baseBranch}.`,
      ];
    case 'pr_opened':
      return [
        'Track CI and reviewer state before final reporting.',
        'Use /flow-watch and read-only /flow-comments before final reporting when a PR has CI or review activity.',
      ];
    case 'ci_waiting':
      return [
        'Wait for remote checks and summarize their status when available.',
        'Move to fixing_local_findings on failures or verified when evidence is acceptable.',
      ];
    case 'review_triage':
      return [
        'Classify review comments before acting on them.',
        'Use /flow-fix-comments with a structured review-fix payload only after fixes and verification evidence are ready.',
        'Stop for human decisions when comments are ambiguous, product-sensitive, or security-sensitive.',
      ];
    case 'fixing_review_findings':
      return [
        'Fix valid review findings with focused changes only.',
        'Re-run local checks, commit through /flow-commit when needed, then use /flow-fix-comments for safe replies and resolution.',
      ];
    case 'verified':
      return [
        'Prepare the final report with verification evidence.',
        'Do not claim completion without fresh check output.',
      ];
    case 'final_reported':
      return [
        'Return to idle after the user has received the final report.',
        'Do not continue changing workflow state unless a new task starts.',
      ];
    case 'blocked':
      return [
        'Stop workflow-changing operations.',
        'Explain the blocker, the current phase, and the human decision needed.',
      ];
    case 'emergency':
      return getEmergencyActions(config);
    default:
      return assertNever(phase);
  }
}

function getLocalCheckActions(config: CodeflowConfig): string[] {
  if (config.checks.length === 0) {
    return [
      'Record that no local checks are configured.',
      'Move to self-review with an explicit note that local checks were not configured.',
    ];
  }

  const checkNames = config.checks.map((check) => check.name).join(', ');

  return [
    `Run configured checks in order with /flow-check: ${checkNames}.`,
    'If checks fail, fix only the failing local findings and run /flow-check again.',
  ];
}

function getEmergencyActions(config: CodeflowConfig): string[] {
  const actions = [
    'Confirm the explicit emergency reason and authority before proceeding.',
    `Prefer the configured emergency path ${config.emergency.defaultPath}.`,
  ];

  if (config.emergency.requireStructuredCommitAndPr) {
    actions.push('Still require structured commit and PR payloads in emergency flow.');
  }

  if (config.emergency.requireFinalReport) {
    actions.push('Still produce a final report with emergency context and verification.');
  }

  return actions;
}

function assertNever(value: never): never {
  throw new TypeError(`Unhandled Codeflow lifecycle phase: ${String(value)}`);
}

export function getExpectedToolsForPhase(
  phase: CodeflowLifecyclePhase,
  config: CodeflowConfig,
): string[] {
  switch (phase) {
    case 'idle':
      return ['/flow-start'];
    case 'initialized':
    case 'branch_prepared':
      return ['/flow-start'];
    case 'planning':
      return [];
    case 'implementing':
    case 'fixing_local_findings':
      return ['/flow-check'];
    case 'local_checks':
      return config.checks.length > 0 ? ['/flow-check'] : [];
    case 'self_review':
      return [];
    case 'ready_to_commit':
      return ['/flow-commit'];
    case 'committed':
      return ['/flow-pr'];
    case 'pr_opened':
    case 'ci_waiting':
      return ['/flow-watch', '/flow-comments'];
    case 'review_triage':
      return ['/flow-comments', '/flow-fix-comments'];
    case 'fixing_review_findings':
      return ['/flow-fix-comments', '/flow-check'];
    case 'verified':
      return [];
    case 'final_reported':
      return [];
    case 'blocked':
      return [];
    case 'emergency':
      return ['/flow-start', '/flow-commit', '/flow-pr'];
    default:
      return assertNever(phase);
  }
}
