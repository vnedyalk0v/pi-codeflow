import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CodeflowConfigLoadError, loadCodeflowConfig } from '../../src/index';

const fixturesDir = fileURLToPath(new URL('../fixtures/', import.meta.url));

function fixturePath(...segments: string[]): string {
  return path.join(fixturesDir, ...segments);
}

async function makeTempProject(configText: string): Promise<string> {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'codeflow-config-'));
  await mkdir(path.join(projectDir, '.pi'), { recursive: true });
  await writeFile(path.join(projectDir, '.pi', 'codeflow.json'), configText, 'utf8');
  return projectDir;
}

describe('loadCodeflowConfig', () => {
  it('loads the default config when no project config exists', async () => {
    const result = await loadCodeflowConfig({ cwd: fixturePath('empty-project') });

    expect(result.usedDefaultConfig).toBe(true);
    expect(result.configPath).toBeNull();
    expect(result.validationWarnings).toEqual([]);
    expect(result.config.baseBranches.default).toBe('dev');
    expect(result.config.checks).toEqual([]);
  });

  it('loads an explicit config path', async () => {
    const configPath = fixturePath('valid-project', '.pi', 'codeflow.json');
    const result = await loadCodeflowConfig({ configPath });

    expect(result.usedDefaultConfig).toBe(false);
    expect(result.configPath).toBe(configPath);
    expect(result.config.baseBranches.default).toBe('main');
    expect(result.config.checks).toEqual([
      {
        name: 'unit tests',
        command: 'npm test',
        timeoutSeconds: 120,
      },
    ]);
  });

  it('loads .pi/codeflow.json from cwd', async () => {
    const cwd = fixturePath('valid-project');
    const result = await loadCodeflowConfig({ cwd });

    expect(result.usedDefaultConfig).toBe(false);
    expect(result.configPath).toBe(fixturePath('valid-project', '.pi', 'codeflow.json'));
    expect(result.config.branching.defaultType).toBe('feat');
    expect(result.config.branching.slug.case).toBe('kebab');
    expect(result.config.branching.slug.maxLength).toBe(40);
  });

  it('loads .pi/codeflow.json from an ancestor of cwd', async () => {
    const nestedDir = path.join(fixturePath('valid-project'), 'packages', 'app');
    const result = await loadCodeflowConfig({ cwd: nestedDir });

    expect(result.configPath).toBe(fixturePath('valid-project', '.pi', 'codeflow.json'));
  });

  it('throws a typed error for invalid JSON', async () => {
    const projectDir = await makeTempProject('{ "baseBranches": ');

    await expect(loadCodeflowConfig({ cwd: projectDir })).rejects.toMatchObject({
      name: 'CodeflowConfigLoadError',
      code: 'invalid_json',
      path: path.join(projectDir, '.pi', 'codeflow.json'),
    });
  });

  it('throws a typed error for invalid project config', async () => {
    await expect(
      loadCodeflowConfig({ cwd: fixturePath('invalid-project') }),
    ).rejects.toMatchObject({
      name: 'CodeflowConfigLoadError',
      code: 'validation_failed',
      path: fixturePath('invalid-project', '.pi', 'codeflow.json'),
    });
  });

  it('throws a typed error when an explicit configPath is missing', async () => {
    const missingPath = fixturePath('empty-project', '.pi', 'codeflow.json');

    await expect(loadCodeflowConfig({ configPath: missingPath })).rejects.toMatchObject({
      name: 'CodeflowConfigLoadError',
      code: 'file_not_found',
      path: missingPath,
    });
  });

  it('throws a typed error when extends is used', async () => {
    const projectDir = await makeTempProject('{ "extends": "./base.json" }');

    await expect(loadCodeflowConfig({ cwd: projectDir })).rejects.toBeInstanceOf(
      CodeflowConfigLoadError,
    );
    await expect(loadCodeflowConfig({ cwd: projectDir })).rejects.toMatchObject({
      code: 'unsupported_extends',
    });
  });
});
