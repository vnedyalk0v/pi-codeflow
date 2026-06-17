import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function withTempFile<T>(
  prefix: string,
  contents: string,
  callback: (filePath: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  const filePath = path.join(dir, 'message.txt');

  try {
    await writeFile(filePath, contents, 'utf8');
    return await callback(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
