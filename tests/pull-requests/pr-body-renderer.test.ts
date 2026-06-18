import { mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
  renderPrBody,
  type CodeflowPrPayload,
} from '../../src/index';

function payload(overrides: Partial<CodeflowPrPayload> = {}): CodeflowPrPayload {
  return {
    title: {
      type: 'feat',
      scope: 'pull-requests',
      summary: 'implement generated pull requests',
    },
    body: {
      summary: 'Implemented the /flow-pr foundation.',
      context: 'Codeflow needs deterministic PR title/body rendering.',
      changes: ['Added payload validation.', 'Added PR body renderer.'],
      verification: ['npm run typecheck', 'npm test'],
      selfReview: ['Confirmed no merge automation was added.'],
      risk: 'Medium. This opens GitHub PRs.',
      rollback: 'Revert this PR.',
      reviewerNotes: 'Focus on GitHub CLI error handling.',
      refs: ['#12'],
    },
    ...overrides,
  };
}

describe('renderPrBody', () => {
  it('renders the standard PR sections deterministically', async () => {
    const result = await renderPrBody(payload());

    expect(result.body).toContain('## Summary\n\nImplemented the /flow-pr foundation.');
    expect(result.body).toContain('## Context\n\nCodeflow needs deterministic PR title/body rendering.');
    expect(result.body).toContain('## Changes\n\n- Added payload validation.\n- Added PR body renderer.');
    expect(result.body).toContain('## Verification\n\n- [x] npm run typecheck\n- [x] npm test');
    expect(result.body).toContain('## Self-review\n\n- [x] Confirmed no merge automation was added.');
    expect(result.body).toContain('## Risk\n\nMedium. This opens GitHub PRs.');
    expect(result.body).toContain('## Rollback\n\nRevert this PR.');
    expect(result.body).toContain('## Reviewer notes\n\nFocus on GitHub CLI error handling.');
    expect(result.body).toContain('## Linked issues\n\nRefs #12');
    expect(result.body).not.toContain('Closes #12');
    expect(result.body).not.toMatch(/{{.*}}/);
  });

  it('normalizes closing keywords to Refs by default', async () => {
    const result = await renderPrBody(
      payload({ body: { ...payload().body, refs: ['Closes #12', 'Fixes #13'] } }),
    );

    expect(result.body).toContain('Refs #12\nRefs #13');
    expect(result.body).not.toContain('Closes #12');
    expect(result.body).not.toContain('Fixes #13');
  });

  it('uses fallback text for missing reviewer notes and refs', async () => {
    const result = await renderPrBody(
      payload({ body: { ...payload().body, reviewerNotes: undefined, refs: [] } }),
    );

    expect(result.body).toContain('## Reviewer notes\n\nNone.');
    expect(result.body).toContain('## Linked issues\n\nNone.');
  });

  it('uses the bundled default template when the configured template is missing', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'codeflow-missing-pr-template-'));
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      pullRequest: {
        template: 'missing/pull-request.md',
      },
    } as Record<string, unknown>);
    const result = await renderPrBody(payload(), { cwd, config });

    expect(result.usedDefaultTemplate).toBe(true);
    expect(result.warnings.join('\n')).toContain('using bundled default pull request template');
    expect(result.body).toContain('## Summary');
  });

  it('errors clearly when the configured template path is not readable as a file', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'codeflow-bad-pr-template-'));
    await mkdir(path.join(cwd, 'template-dir'));
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      pullRequest: {
        template: 'template-dir',
      },
    } as Record<string, unknown>);

    await expect(renderPrBody(payload(), { cwd, config })).rejects.toMatchObject({
      name: 'CodeflowPrError',
      code: 'template_unreadable',
    });
  });

  it('errors when a custom template leaves unresolved placeholders', async () => {
    await expect(
      renderPrBody(payload(), {
        templateText: '## Summary\n\n{{summary}}\n\n## Context\n\n{{context}}\n\n## Changes\n\n{{changesList}}\n\n## Verification\n\n{{verificationList}}\n\n## Self-review\n\n{{selfReviewList}}\n\n## Risk\n\n{{risk}}\n\n## Rollback\n\n{{rollback}}\n\n## Reviewer notes\n\n{{reviewerNotes}}\n\n## Linked issues\n\n{{linkedIssuesList}}\n\n{{unknown}}',
      }),
    ).rejects.toMatchObject({ code: 'unresolved_template_placeholder' });
  });
});
