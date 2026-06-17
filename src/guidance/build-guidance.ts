import type { CodeflowConfig } from '../config/codeflow-config';
import { assertCodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import { createInitialLifecycleState } from '../lifecycle/lifecycle-state';
import {
  getExpectedToolsForPhase,
  getNextExpectedActions,
} from '../lifecycle/lifecycle-transitions';
import type {
  CodeflowGuidanceContext,
  CodeflowGuidanceResult,
} from './guidance-context';
import {
  formatBulletList,
  formatCodeflowGuidanceSection,
  formatInlineList,
} from './guidance-format';

export const CODEFLOW_WORKFLOW_TOOLS = [
  '/flow-start',
  '/flow-plan',
  '/flow-status',
  '/flow-check',
  '/flow-review',
  '/flow-commit',
  '/flow-pr',
  '/flow-watch',
  '/flow-comments',
  '/flow-fix-comments',
  '/flow-report',
] as const;

export function buildCodeflowGuidance(
  config: CodeflowConfig,
  context: CodeflowGuidanceContext = {},
): CodeflowGuidanceResult {
  const activePhase = assertCodeflowLifecyclePhase(context.activePhase ?? 'idle');
  const currentBranch = context.currentBranch ?? null;
  const state = createInitialLifecycleState({
    phase: activePhase,
    baseBranch: config.baseBranches.default,
    workBranch: currentBranch,
  });
  const expectedTools = getExpectedToolsForPhase(activePhase, config);
  const nextActions = getNextExpectedActions(state, config);
  const warnings = getGuidanceWarnings(config, context);
  const checkNames = config.checks.map((check) => check.name);
  const workflowGuidance = getWorkflowGuidance(config);
  const messageGuidance = getMessageGuidance(config);

  const systemPromptAppend = formatCodeflowGuidanceSection('Codeflow guidance', [
    'Codeflow is active for this repository.',
    `Active lifecycle phase: ${activePhase}. Follow the configured Codeflow lifecycle.`,
    `Default base branch: ${config.baseBranches.default}.`,
    `Reserved branches: ${formatInlineList(config.reservedBranches)}.`,
    `Expected Codeflow tools for this phase: ${formatInlineList(expectedTools)}.`,
    `Lifecycle tool surface: ${formatInlineList([...CODEFLOW_WORKFLOW_TOOLS])}.`,
    `Configured check names: ${formatInlineList(checkNames)}.`,
    '',
    'Next expected actions:',
    formatBulletList(nextActions),
    '',
    'Workflow guidance:',
    ...workflowGuidance.map((line) => `- ${line}`),
    warnings.length > 0 ? '' : '',
    warnings.length > 0 ? 'Warnings:' : '',
    warnings.length > 0 ? formatBulletList(warnings) : '',
  ]);

  const message = [
    'Codeflow is active.',
    '',
    `Phase: ${activePhase}`,
    `Base branch: ${config.baseBranches.default}`,
    `Reserved branches: ${formatInlineList(config.reservedBranches)}`,
    `Expected tools: ${formatInlineList(expectedTools)}`,
    '',
    messageGuidance,
    warnings.length > 0 ? '' : undefined,
    warnings.length > 0 ? 'Warnings:' : undefined,
    ...warnings.map((warning) => `- ${warning}`),
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');

  return {
    systemPromptAppend,
    message,
    summary: {
      reservedBranches: [...config.reservedBranches],
      baseBranch: config.baseBranches.default,
      activePhase,
      expectedTools,
      warnings,
    },
  };
}

function getWorkflowGuidance(config: CodeflowConfig): string[] {
  const lines: string[] = [];

  if (config.guidance.proactive) {
    lines.push(
      'Be proactive: guide work toward the next valid Codeflow step before relying on blockers.',
    );
  } else {
    lines.push(
      'Follow the configured lifecycle conservatively; do not present proactive guidance as a configured requirement.',
    );
  }

  if (
    config.guidance.requireStructuredPayloads ||
    config.guidance.renderOutputsFromTemplates
  ) {
    lines.push(
      'Do not manually invent branch, commit, PR, review reply, or final report formats.',
    );
  }

  if (config.guidance.requireStructuredPayloads) {
    lines.push(
      'Provide structured payloads when Codeflow asks for branch, commit, PR, review, or report data.',
    );
  }

  if (config.guidance.renderOutputsFromTemplates) {
    lines.push(
      'Let Codeflow render final branch names, commit messages, PR bodies, review replies, and reports from templates.',
    );
  }

  lines.push(
    'Use Codeflow tools when available instead of raw git workflow operations for workflow steps.',
    'If a required Codeflow tool is not implemented yet, explain the limitation rather than pretending it exists.',
    'Do not work directly on reserved branches during normal workflow.',
    'Treat safety boundaries as fallback airbags, not the normal user experience.',
  );

  if (config.guidance.stopForHumanDecisions) {
    lines.push('Stop for a human decision when the config or lifecycle requires it.');
  }

  return lines;
}

function getMessageGuidance(config: CodeflowConfig): string {
  const lines = [
    'Use Codeflow tools when available instead of raw git workflow operations.',
  ];

  if (config.guidance.requireStructuredPayloads) {
    lines.push('Provide structured payloads when asked.');
  }

  if (config.guidance.renderOutputsFromTemplates) {
    lines.push('Let templates render final outputs.');
  }

  lines.push(
    'If required Codeflow tooling is not implemented yet, explain that limitation.',
    'Treat safety boundaries as fallback airbags.',
  );

  if (config.guidance.stopForHumanDecisions) {
    lines.push('Stop for required human decisions.');
  }

  return lines.join(' ');
}

function getGuidanceWarnings(
  config: CodeflowConfig,
  context: CodeflowGuidanceContext,
): string[] {
  const warnings: string[] = [];

  if (context.usedDefaultConfig) {
    warnings.push('No project Codeflow config was found; package defaults are in use.');
  }

  if (
    context.currentBranch &&
    config.reservedBranches.includes(context.currentBranch) &&
    config.safety.blockDirectWorkOnReservedBranches
  ) {
    warnings.push(
      `Current branch ${context.currentBranch} is reserved; avoid normal workflow changes here.`,
    );
  }

  if (!config.guidance.proactive) {
    warnings.push('Config guidance.proactive is disabled; keep Codeflow guidance conservative.');
  }

  if (!config.guidance.requireStructuredPayloads) {
    warnings.push(
      'Config guidance.requireStructuredPayloads is disabled; do not present structured payloads as mandatory unless explicitly requested.',
    );
  }

  if (!config.guidance.renderOutputsFromTemplates) {
    warnings.push(
      'Config guidance.renderOutputsFromTemplates is disabled; do not present template-rendered outputs as mandatory.',
    );
  }

  if (!config.guidance.stopForHumanDecisions) {
    warnings.push(
      'Config guidance.stopForHumanDecisions is disabled; do not present human-decision stops as mandatory guidance unless other policy requires them.',
    );
  }

  return warnings;
}
