import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import { loadTemplateFromCandidates } from '../utils/template-loader';
import { BranchPolicyError } from './branch-errors';

export interface BranchTemplateContext {
  type: string;
  slug: string;
  ticket: string | null;
}

const DEFAULT_BRANCH_TEMPLATE_PATTERN = '{{type}}/{{ticketPrefix}}{{slug}}';

export function getDefaultBranchTemplatePattern(): string {
  return DEFAULT_BRANCH_TEMPLATE_PATTERN;
}

export function extractBranchTemplatePattern(templateText: string): string {
  const lines = templateText.split(/\r?\n/);
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (line.trimStart().startsWith('<!--')) {
      break;
    }

    bodyLines.push(line);
  }

  const pattern = bodyLines.join('\n').trim();
  return pattern.length > 0 ? pattern : DEFAULT_BRANCH_TEMPLATE_PATTERN;
}

export async function loadBranchTemplatePattern(
  config: Pick<CodeflowConfig, 'branching' | 'templates'>,
  cwd: string,
): Promise<string> {
  const templatePath = getConfiguredBranchTemplatePath(config);
  const loadedTemplate = await loadTemplateFromCandidates({
    templatePath,
    cwd,
    templateName: 'Branch name',
    createError: (options) => new BranchPolicyError({
      code: 'branch_template_not_found',
      ...options,
    }),
  });

  if (loadedTemplate) {
    return extractBranchTemplatePattern(loadedTemplate.text);
  }

  throw new BranchPolicyError({
    code: 'branch_template_not_found',
    message: `Branch name template was not found: ${templatePath}`,
    details: { templatePath },
  });
}

export function renderBranchTemplate(
  pattern: string,
  context: BranchTemplateContext,
): string {
  const ticket = context.ticket ?? '';
  const ticketPrefix = ticket.length > 0 ? `${ticket}-` : '';

  return pattern
    .replaceAll('{{type}}', context.type)
    .replaceAll('{{slug}}', context.slug)
    .replaceAll('{{ticket}}', ticket)
    .replaceAll('{{ticketPrefix}}', ticketPrefix)
    .replaceAll('{{ticketSegment}}', ticketPrefix);
}

function getConfiguredBranchTemplatePath(
  config: Pick<CodeflowConfig, 'branching' | 'templates'>,
): string {
  const defaultConfig = getDefaultCodeflowConfig();

  if (config.branching.template !== defaultConfig.branching.template) {
    return config.branching.template;
  }

  return config.templates.branchName;
}
