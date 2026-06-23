import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LoadedTextTemplate {
  text: string;
  templatePath: string | null;
  usedDefaultTemplate: boolean;
  warnings: string[];
}

interface TemplateErrorOptions {
  message: string;
  details: Record<string, unknown>;
  cause?: unknown;
}

interface LoadTemplateOptions {
  templatePath: string;
  cwd: string;
  templateName: string;
  createError(options: TemplateErrorOptions): Error;
}

interface LoadTemplateWithDefaultOptions extends LoadTemplateOptions {
  defaultTemplatePath: string;
  warning(configuredPath: string): string;
}

interface FoundTemplate {
  text: string;
  templatePath: string;
}

export async function loadTemplateFromCandidates(
  options: LoadTemplateOptions,
): Promise<FoundTemplate | null> {
  for (const candidate of getTemplateCandidates(options.templatePath, options.cwd)) {
    const status = await statTemplateCandidate(candidate, options);

    if (status === 'missing') {
      continue;
    }

    if (status === 'not_file') {
      throw options.createError({
        message: `${options.templateName} template is not a file: ${candidate}`,
        details: { templatePath: candidate },
      });
    }

    try {
      return {
        text: await readFile(candidate, 'utf8'),
        templatePath: candidate,
      };
    } catch (error) {
      throw options.createError({
        message: `${options.templateName} template could not be read: ${candidate}`,
        details: { templatePath: candidate },
        cause: error,
      });
    }
  }

  return null;
}

export async function loadTemplateWithBundledDefault(
  options: LoadTemplateWithDefaultOptions,
): Promise<LoadedTextTemplate> {
  const found = await loadTemplateFromCandidates(options);

  if (found) {
    return {
      ...found,
      usedDefaultTemplate: false,
      warnings: [],
    };
  }

  const bundledPath = path.resolve(getPackageRoot(), options.defaultTemplatePath);

  try {
    return {
      text: await readFile(bundledPath, 'utf8'),
      templatePath: bundledPath,
      usedDefaultTemplate: true,
      warnings: [options.warning(options.templatePath)],
    };
  } catch (error) {
    throw options.createError({
      message: `Bundled ${options.templateName.toLowerCase()} template could not be read: ${bundledPath}`,
      details: { configuredPath: options.templatePath, bundledPath },
      cause: error,
    });
  }
}

function getTemplateCandidates(templatePath: string, cwd: string): string[] {
  if (path.isAbsolute(templatePath)) {
    return [templatePath];
  }

  const packageRoot = getPackageRoot();
  return [path.resolve(cwd, templatePath), path.resolve(packageRoot, templatePath)];
}

function getPackageRoot(): string {
  return fileURLToPath(new URL('../../', import.meta.url));
}

async function statTemplateCandidate(
  candidate: string,
  options: LoadTemplateOptions,
): Promise<'file' | 'missing' | 'not_file'> {
  try {
    const stats = await stat(candidate);
    return stats.isFile() ? 'file' : 'not_file';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'missing';
    }

    throw options.createError({
      message: `${options.templateName} template could not be inspected: ${candidate}`,
      details: { templatePath: candidate },
      cause: error,
    });
  }
}
