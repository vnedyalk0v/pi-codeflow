import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BranchPolicyError,
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
} from '../../src/index';
import { loadBranchTemplatePattern } from '../../src/branching/branch-template';

async function makeTempProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'codeflow-branch-template-'));
}

describe('loadBranchTemplatePattern', () => {
  it('respects branching.template overrides', async () => {
    const cwd = await makeTempProject();
    await mkdir(path.join(cwd, 'custom'), { recursive: true });
    await writeFile(path.join(cwd, 'custom', 'branch.md'), '{{type}}/{{slug}}-custom\n', 'utf8');
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      branching: {
        template: 'custom/branch.md',
      },
    } as Record<string, unknown>);

    await expect(loadBranchTemplatePattern(config, cwd)).resolves.toBe(
      '{{type}}/{{slug}}-custom',
    );
  });

  it('respects templates.branchName when branching.template remains default', async () => {
    const cwd = await makeTempProject();
    await mkdir(path.join(cwd, 'named'), { recursive: true });
    await writeFile(path.join(cwd, 'named', 'branch.md'), '{{type}}/{{ticketPrefix}}{{slug}}\n', 'utf8');
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      templates: {
        branchName: 'named/branch.md',
      },
    } as Record<string, unknown>);

    await expect(loadBranchTemplatePattern(config, cwd)).resolves.toBe(
      '{{type}}/{{ticketPrefix}}{{slug}}',
    );
  });

  it('fails when the configured template is missing', async () => {
    const cwd = await makeTempProject();
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      branching: {
        template: 'missing/branch.md',
      },
    } as Record<string, unknown>);

    await expect(loadBranchTemplatePattern(config, cwd)).rejects.toMatchObject({
      name: 'BranchPolicyError',
      code: 'branch_template_not_found',
    } satisfies Partial<BranchPolicyError>);
  });
});
