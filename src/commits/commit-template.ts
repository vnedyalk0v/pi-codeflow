import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CodeflowConfig } from '../config/codeflow-config';
import { getDefaultCodeflowConfig } from '../config/default-config';
import { CodeflowCommitError } from './commit-errors';

export interface LoadedCommitTemplate {
  text: string;
  templatePath: string | null;
  usedDefaultTemplate: boolean;
  warnings: string[];
}

const DEFAULT_COMMIT_TEMPLATE_PATH = 'templates/commit-message.md';

export async function loadCommitTemplate(
  config: Pick<CodeflowConfig, 'commits' | 'templates'> = getDefaultCodeflowConfig(),
  cwd = process.cwd(),
): Promise<LoadedCommitTemplate> {
  const configuredPath = getConfiguredCommitTemplatePath(config);
  const candidates = getCommitTemplateCandidates(configuredPath, cwd);

  for (const candidate of candidates) {
    const status = await statTemplateCandidate(candidate);

    if (status === 'missing') {
      continue;
    }

    if (status === 'not_file') {
      throw new CodeflowCommitError({
        code: 'template_unreadable',
        message: `Commit message template is not a file: ${candidate}`,
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
      throw new CodeflowCommitError({
        code: 'template_unreadable',
        message: `Commit message template could not be read: ${candidate}`,
        details: { templatePath: candidate },
        cause: error,
      });
    }
  }

  return loadBundledDefaultTemplate(configuredPath);
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

async function loadBundledDefaultTemplate(configuredPath: string): Promise<LoadedCommitTemplate> {
  const bundledPath = getBundledDefaultCommitTemplatePath();

  try {
    return {
      text: await readFile(bundledPath, 'utf8'),
      templatePath: bundledPath,
      usedDefaultTemplate: true,
      warnings: [
        `Configured commit template ${configuredPath} was not found; using bundled default commit template.`,
      ],
    };
  } catch (error) {
    throw new CodeflowCommitError({
      code: 'template_unreadable',
      message: `Bundled commit message template could not be read: ${bundledPath}`,
      details: { configuredPath, bundledPath },
      cause: error,
    });
  }
}

function getCommitTemplateCandidates(templatePath: string, cwd: string): string[] {
  if (path.isAbsolute(templatePath)) {
    return [templatePath];
  }

  const packageRoot = getPackageRoot();
  return [path.resolve(cwd, templatePath), path.resolve(packageRoot, templatePath)];
}

function getBundledDefaultCommitTemplatePath(): string {
  return path.resolve(getPackageRoot(), DEFAULT_COMMIT_TEMPLATE_PATH);
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

    throw new CodeflowCommitError({
      code: 'template_unreadable',
      message: `Commit message template could not be inspected: ${candidate}`,
      details: { templatePath: candidate },
      cause: error,
    });
  }
}
