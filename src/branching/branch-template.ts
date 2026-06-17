import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import { BranchPolicyError } from './branch-errors';
import { fileExists } from '../utils/fs';

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
  const candidates = getBranchTemplateCandidates(templatePath, cwd);

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      const text = await readFile(candidate, 'utf8');
      return extractBranchTemplatePattern(text);
    }
  }

  throw new BranchPolicyError({
    code: 'branch_template_not_found',
    message: `Branch name template was not found: ${templatePath}`,
    details: { templatePath, searchedPaths: candidates },
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

function getBranchTemplateCandidates(templatePath: string, cwd: string): string[] {
  if (path.isAbsolute(templatePath)) {
    return [templatePath];
  }

  const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

  return [path.resolve(cwd, templatePath), path.resolve(packageRoot, templatePath)];
}
