import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface JsonPayloadErrorOptions<TCode extends string> {
  code: TCode;
  message: string;
  details: Record<string, unknown>;
  cause?: unknown;
}

interface ReadJsonPayloadFileOptions<TCode extends string> {
  payloadPath: string;
  cwd?: string;
  label: string;
  fileNotFoundCode: TCode;
  fileUnreadableCode: TCode;
  invalidJsonCode: TCode;
  createError(options: JsonPayloadErrorOptions<TCode>): Error;
}

export async function readJsonPayloadFile<T, TCode extends string>(
  options: ReadJsonPayloadFileOptions<TCode>,
): Promise<T> {
  const resolvedPath = path.isAbsolute(options.payloadPath)
    ? options.payloadPath
    : path.resolve(options.cwd ?? process.cwd(), options.payloadPath);
  let text: string;

  try {
    text = await readFile(resolvedPath, 'utf8');
  } catch (error) {
    throw options.createError({
      code: (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? options.fileNotFoundCode
        : options.fileUnreadableCode,
      message: `${options.label} file could not be read: ${resolvedPath}`,
      details: { payloadPath: resolvedPath },
      cause: error,
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw options.createError({
      code: options.invalidJsonCode,
      message: `${options.label} file contains invalid JSON: ${resolvedPath}`,
      details: { payloadPath: resolvedPath },
      cause: error,
    });
  }
}
