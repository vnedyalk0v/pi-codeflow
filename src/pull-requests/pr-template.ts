import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import {
  loadTemplateWithBundledDefault,
  type LoadedTextTemplate,
} from '../utils/template-loader';
import { CodeflowPrError } from './pr-errors';

export type LoadedPrTemplate = LoadedTextTemplate;

const DEFAULT_PR_TEMPLATE_PATH = 'templates/pull-request.md';

export async function loadPrTemplate(
  config: Pick<CodeflowConfig, 'pullRequest' | 'templates'> = getDefaultCodeflowConfig(),
  cwd = process.cwd(),
): Promise<LoadedPrTemplate> {
  const configuredPath = getConfiguredPrTemplatePath(config);
  return loadTemplateWithBundledDefault({
    templatePath: configuredPath,
    cwd,
    templateName: 'Pull request',
    defaultTemplatePath: DEFAULT_PR_TEMPLATE_PATH,
    warning: (templatePath) =>
      `Configured pull request template ${templatePath} was not found; using bundled default pull request template.`,
    createError: (options) => new CodeflowPrError({
      code: 'template_unreadable',
      ...options,
    }),
  });
}

export function getConfiguredPrTemplatePath(
  config: Pick<CodeflowConfig, 'pullRequest' | 'templates'>,
): string {
  const defaultConfig = getDefaultCodeflowConfig();

  if (config.pullRequest.template !== defaultConfig.pullRequest.template) {
    return config.pullRequest.template;
  }

  return config.templates.pullRequest;
}
