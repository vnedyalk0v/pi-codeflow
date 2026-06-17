import { mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  renderCommitMessage,
  type CodeflowCommitPayload,
} from '../../src/index';

function payload(overrides: Partial<CodeflowCommitPayload> = {}): CodeflowCommitPayload {
  return {
    type: 'feat',
    scope: 'billing',
    summary: 'add stripe webhook signature verification',
    context: 'Stripe webhooks were accepted without verifying request authenticity.',
    changes: [
      'Added signature verification middleware.',
      'Added timestamp tolerance validation.',
    ],
    verification: ['npm run lint', 'npm test'],
    risk: 'Low. Invalid webhook requests are rejected before processing.',
    refs: ['BILL-142'],
    ...overrides,
  };
}

describe('renderCommitMessage', () => {
  it('renders title with scope and required body sections', async () => {
    const result = await renderCommitMessage(payload());

    expect(result.title).toBe('feat(billing): add stripe webhook signature verification');
    expect(result.message).toContain('Context:\nStripe webhooks were accepted');
    expect(result.message).toContain('Changes:\n- Added signature verification middleware.');
    expect(result.message).toContain('Verification:\n- npm run lint\n- npm test');
    expect(result.message).toContain('Risk:\nLow. Invalid webhook requests');
    expect(result.message).toContain('Refs: BILL-142');
    expect(result.body).toContain('Context:');
  });

  it('renders title without scope', async () => {
    const result = await renderCommitMessage(payload({ scope: undefined, type: 'docs' }));

    expect(result.title).toBe('docs: add stripe webhook signature verification');
  });

  it('renders breaking changes with the Conventional Commits marker and footer', async () => {
    const result = await renderCommitMessage(
      payload({ breakingChange: 'Webhook requests without a valid signature are rejected.' }),
    );

    expect(result.title).toBe('feat(billing)!: add stripe webhook signature verification');
    expect(result.message).toContain(
      'BREAKING CHANGE: Webhook requests without a valid signature are rejected.',
    );
  });

  it('renders additional footers deterministically', async () => {
    const result = await renderCommitMessage(
      payload({ footers: { CoAuthoredBy: 'Codeflow Bot <bot@example.test>' } }),
    );

    expect(result.message).toContain('CoAuthoredBy: Codeflow Bot <bot@example.test>');
  });

  it('renders explicit fallback text when verification or risk are allowed to be omitted', async () => {
    const result = await renderCommitMessage(payload({ verification: [], risk: undefined }));

    expect(result.message).toContain(
      '- Not provided; unverified commit payload was explicitly allowed.',
    );
    expect(result.message).toContain(
      'Risk:\nNot provided; risk was explicitly allowed to be omitted.',
    );
  });

  it('does not leave unresolved placeholders', async () => {
    const result = await renderCommitMessage(payload());

    expect(result.message).not.toMatch(/{{.*}}/);
  });

  it('uses the bundled default template when the configured template is missing', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'codeflow-missing-commit-template-'));
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      commits: {
        template: 'missing/commit-message.md',
      },
    } as Record<string, unknown>);
    const result = await renderCommitMessage(payload(), { cwd, config });

    expect(result.usedDefaultTemplate).toBe(true);
    expect(result.warnings.join('\n')).toContain('using bundled default commit template');
    expect(result.title).toBe('feat(billing): add stripe webhook signature verification');
  });

  it('errors clearly when the configured template path is not readable as a file', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'codeflow-bad-commit-template-'));
    await mkdir(path.join(cwd, 'template-dir'));
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      commits: {
        template: 'template-dir',
      },
    } as Record<string, unknown>);

    await expect(renderCommitMessage(payload(), { cwd, config })).rejects.toMatchObject({
      name: 'CodeflowCommitError',
      code: 'template_unreadable',
    });
  });

  it('errors when a custom template leaves unresolved placeholders', async () => {
    await expect(
      renderCommitMessage(payload(), {
        templateText: '{{title}}\n\nContext:\n{{context}}\n\nChanges:\n{{changesList}}\n\nVerification:\n{{verificationList}}\n\nRisk:\n{{risk}}\n\n{{unknown}}',
      }),
    ).rejects.toMatchObject({ code: 'unresolved_template_placeholder' });
  });
});
