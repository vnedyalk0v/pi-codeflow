import { readFile, stat } from 'node:fs/promises';

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}


export async function readUtf8File(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8');
}
