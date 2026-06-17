import { describe, expect, it } from 'vitest';

import {
  appendCodeflowGuidanceToSystemPrompt,
  formatBulletList,
  formatCodeflowGuidanceSection,
  formatInlineList,
} from '../../src/guidance/guidance-format';

describe('guidance formatting', () => {
  it('formats inline lists with an explicit empty value', () => {
    expect(formatInlineList(['main', 'dev'])).toBe('main, dev');
    expect(formatInlineList([], 'not configured')).toBe('not configured');
  });

  it('formats bullet lists deterministically', () => {
    expect(formatBulletList(['one', 'two'])).toBe('- one\n- two');
    expect(formatBulletList([])).toBe('- none');
  });

  it('formats guidance sections without blank lines from empty inputs', () => {
    expect(formatCodeflowGuidanceSection('Codeflow', ['line one', '', 'line two'])).toBe(
      '## Codeflow\n\nline one\nline two',
    );
  });

  it('appends guidance to an existing system prompt', () => {
    const result = appendCodeflowGuidanceToSystemPrompt('base prompt\n', 'guidance\n');

    expect(result).toBe('base prompt\n\nguidance');
  });
});
