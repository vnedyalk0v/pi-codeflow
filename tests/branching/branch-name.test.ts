import { describe, expect, it } from 'vitest';

import {
  BranchPolicyError,
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  renderBranchName,
} from '../../src/index';

describe('renderBranchName', () => {
  it('renders a feature branch without an ai prefix', async () => {
    const config = getDefaultCodeflowConfig();

    await expect(
      renderBranchName({ type: 'feat', task: 'Add Google OAuth login', config }),
    ).resolves.toBe('feat/add-google-oauth-login');
  });

  it('renders a fix branch', async () => {
    const config = getDefaultCodeflowConfig();

    await expect(
      renderBranchName({ type: 'fix', task: 'Handle empty billing email', config }),
    ).resolves.toBe('fix/handle-empty-billing-email');
  });

  it('preserves detected tickets before the slug', async () => {
    const config = getDefaultCodeflowConfig();

    await expect(
      renderBranchName({
        type: 'feat',
        task: 'BILL-142 Add Stripe webhook',
        config,
      }),
    ).resolves.toBe('feat/BILL-142-add-stripe-webhook');
  });

  it('uses an explicit ticket when provided', async () => {
    const config = getDefaultCodeflowConfig();

    await expect(
      renderBranchName({
        type: 'fix',
        task: 'Handle empty user email',
        ticket: 'PROJ-9',
        config,
      }),
    ).resolves.toBe('fix/PROJ-9-handle-empty-user-email');
  });

  it('strips invalid characters and collapses duplicate hyphens', async () => {
    const config = getDefaultCodeflowConfig();

    await expect(
      renderBranchName({
        type: 'docs',
        task: 'Update: configuration!!! guide -- examples',
        config,
      }),
    ).resolves.toBe('docs/update-configuration-guide-examples');
  });

  it('respects max slug length', async () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      branching: { slug: { maxLength: 16 } },
    } as Record<string, unknown>);

    await expect(
      renderBranchName({
        type: 'feat',
        task: 'Add Google OAuth login support',
        config,
      }),
    ).resolves.toBe('feat/add-google-oauth');
  });

  it('uses numeric collision suffixes when branches already exist', async () => {
    const config = getDefaultCodeflowConfig();
    const existingBranches = new Set([
      'feat/add-google-oauth-login',
      'feat/add-google-oauth-login-2',
    ]);

    await expect(
      renderBranchName({
        type: 'feat',
        task: 'Add Google OAuth login',
        config,
        branchExists: (branchName) => existingBranches.has(branchName),
      }),
    ).resolves.toBe('feat/add-google-oauth-login-3');
  });

  it('fails when the task has no useful slug', async () => {
    const config = getDefaultCodeflowConfig();

    await expect(renderBranchName({ type: 'feat', task: 'update', config })).rejects.toThrow(
      BranchPolicyError,
    );
  });
});
