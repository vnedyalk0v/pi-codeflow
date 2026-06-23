import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import {
  loadTemplateWithBundledDefault,
  type LoadedTextTemplate,
} from '../utils/template-loader';
import { CodeflowCommitError } from './commit-errors';

export type LoadedCommitTemplate = LoadedTextTemplate;

const DEFAULT_COMMIT_TEMPLATE_PATH = 'templates/commit-message.md';

export async function loadCommitTemplate(
  config: Pick<CodeflowConfig, 'commits' | 'templates'> = getDefaultCodeflowConfig(),
  cwd = process.cwd(),
): Promise<LoadedCommitTemplate> {
  const configuredPath = getConfiguredCommitTemplatePath(config);
  return loadTemplateWithBundledDefault({
    templatePath: configuredPath,
    cwd,
    templateName: 'Commit message',
    defaultTemplatePath: DEFAULT_COMMIT_TEMPLATE_PATH,
    warning: (templatePath) =>
      `Configured commit template ${templatePath} was not found; using bundled default commit template.`,
    createError: (options) => new CodeflowCommitError({
      code: 'template_unreadable',
      ...options,
    }),
  });
}

export function getConfiguredCommitTemplatePath(
  config: Pick<CodeflowConfig, 'commits' | 'templates'>,
): string {
  const defaultConfig = getDefaultCodeflowConfig();

  if (config.commits.template !== defaultConfig.commits.template) {
    return config.commits.template;
  }

  return config.templates.commitMessage;
}
