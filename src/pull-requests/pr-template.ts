import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import { CodeflowPrError } from './pr-errors';

export interface LoadedPrTemplate {
  text: string;
  templatePath: string | null;
  usedDefaultTemplate: boolean;
  warnings: string[];
}

const DEFAULT_PR_TEMPLATE_PATH = 'templates/pull-request.md';

export async function loadPrTemplate(
  config: Pick<CodeflowConfig, 'pullRequest' | 'templates'> = getDefaultCodeflowConfig(),
  cwd = process.cwd(),
): Promise<LoadedPrTemplate> {
  const configuredPath = getConfiguredPrTemplatePath(config);
  const candidates = getPrTemplateCandidates(configuredPath, cwd);

  for (const candidate of candidates) {
    const status = await statTemplateCandidate(candidate);

    if (status === 'missing') {
      continue;
    }

    if (status === 'not_file') {
      throw new CodeflowPrError({
        code: 'template_unreadable',
        message: `Pull request template is not a file: ${candidate}`,
        details: { templatePath: candidate },
      });
    }

    try {
      return {
        text: await readFile(candidate, 'utf8'),
        templatePath: candidate,
        usedDefaultTemplate: false,
        warnings: [],
      };
    } catch (error) {
      throw new CodeflowPrError({
        code: 'template_unreadable',
        message: `Pull request template could not be read: ${candidate}`,
        details: { templatePath: candidate },
        cause: error,
      });
    }
  }

  return loadBundledDefaultTemplate(configuredPath);
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

async function loadBundledDefaultTemplate(configuredPath: string): Promise<LoadedPrTemplate> {
  const bundledPath = getBundledDefaultPrTemplatePath();

  try {
    return {
      text: await readFile(bundledPath, 'utf8'),
      templatePath: bundledPath,
      usedDefaultTemplate: true,
      warnings: [
        `Configured pull request template ${configuredPath} was not found; using bundled default pull request template.`,
      ],
    };
  } catch (error) {
    throw new CodeflowPrError({
      code: 'template_unreadable',
      message: `Bundled pull request template could not be read: ${bundledPath}`,
      details: { configuredPath, bundledPath },
      cause: error,
    });
  }
}

function getPrTemplateCandidates(templatePath: string, cwd: string): string[] {
  if (path.isAbsolute(templatePath)) {
    return [templatePath];
  }

  const packageRoot = getPackageRoot();
  return [path.resolve(cwd, templatePath), path.resolve(packageRoot, templatePath)];
}

function getBundledDefaultPrTemplatePath(): string {
  return path.resolve(getPackageRoot(), DEFAULT_PR_TEMPLATE_PATH);
}

function getPackageRoot(): string {
  return fileURLToPath(new URL('../../', import.meta.url));
}

async function statTemplateCandidate(
  candidate: string,
): Promise<'file' | 'missing' | 'not_file'> {
  try {
    const stats = await stat(candidate);
    return stats.isFile() ? 'file' : 'not_file';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'missing';
    }

    throw new CodeflowPrError({
      code: 'template_unreadable',
      message: `Pull request template could not be inspected: ${candidate}`,
      details: { templatePath: candidate },
      cause: error,
    });
  }
}
