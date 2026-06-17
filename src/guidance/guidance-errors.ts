import { CodeflowConfigLoadError } from '../config/config-errors';
import { assertCodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';
import type {
  CodeflowGuidanceContext,
  CodeflowGuidanceResult,
} from './guidance-context';
import {
  formatBulletList,
  formatCodeflowGuidanceSection,
} from './guidance-format';

export function buildCodeflowConfigLoadFailureGuidance(
  error: unknown,
  context: CodeflowGuidanceContext = {},
): CodeflowGuidanceResult {
  const activePhase = assertCodeflowLifecyclePhase(context.activePhase ?? 'blocked');
  const warning = getSafeConfigLoadWarning(error);
  const warnings = [
    warning,
    'Do not perform workflow-changing operations until Codeflow config is fixed.',
  ];
  const expectedTools = ['/flow-status'];

  const systemPromptAppend = formatCodeflowGuidanceSection('Codeflow guidance warning', [
    'Codeflow is active, but configuration could not be loaded safely.',
    `Active lifecycle phase: ${activePhase}. Treat the workflow as blocked until config is fixed.`,
    '',
    'Required behavior:',
    '- Tell the user that Codeflow config could not be loaded.',
    '- Do not perform branch, commit, PR, review, or report workflow changes until config is fixed.',
    '- Do not invent missing Codeflow tool behavior or bypass configuration validation.',
    '- Ask for a human decision if continuing would require guessing policy.',
    '',
    'Warnings:',
    formatBulletList(warnings),
  ]);

  const message = [
    'Codeflow config could not be loaded.',
    '',
    warning,
    'Do not perform workflow-changing operations until Codeflow config is fixed.',
  ].join('\n');

  return {
    systemPromptAppend,
    message,
    summary: {
      reservedBranches: [],
      baseBranch: 'unknown',
      activePhase,
      expectedTools,
      warnings,
    },
  };
}

function getSafeConfigLoadWarning(error: unknown): string {
  if (error instanceof CodeflowConfigLoadError) {
    return `Codeflow config load failed with code ${error.code}.`;
  }

  return 'Codeflow config load failed before validated configuration was available.';
}
