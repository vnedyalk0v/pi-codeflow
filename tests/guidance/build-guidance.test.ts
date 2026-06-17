import { describe, expect, it } from 'vitest';

import {
  buildCodeflowGuidance,
  getDefaultCodeflowConfig,
  mergeCodeflowConfig,
} from '../../src/index';

function makeProjectConfig() {
  return mergeCodeflowConfig(getDefaultCodeflowConfig(), {
    reservedBranches: ['trunk', 'stable'],
    baseBranches: {
      default: 'main',
      allowed: ['main', 'stable'],
      fallback: 'stable',
    },
    pullRequest: {
      baseBranch: 'main',
    },
  } as Record<string, unknown>);
}

describe('buildCodeflowGuidance', () => {
  it('builds proactive guidance from the default config', () => {
    const result = buildCodeflowGuidance(getDefaultCodeflowConfig());

    expect(result.systemPromptAppend).toContain('Codeflow is active');
    expect(result.systemPromptAppend).toContain('Follow the configured Codeflow lifecycle');
    expect(result.message).toContain('Codeflow is active');
    expect(result.summary.activePhase).toBe('idle');
    expect(result.summary.baseBranch).toBe('dev');
  });

  it('reflects project config reserved branches in guidance', () => {
    const result = buildCodeflowGuidance(makeProjectConfig());

    expect(result.systemPromptAppend).toContain('trunk, stable');
    expect(result.message).toContain('Reserved branches: trunk, stable');
    expect(result.summary.reservedBranches).toEqual(['trunk', 'stable']);
  });

  it('includes reserved branches and the configured base branch', () => {
    const result = buildCodeflowGuidance(makeProjectConfig());

    expect(result.summary.baseBranch).toBe('main');
    expect(result.systemPromptAppend).toContain('Default base branch: main');
    expect(result.systemPromptAppend).toContain('Reserved branches: trunk, stable');
  });

  it('mentions expected Codeflow tools without claiming they are implemented', () => {
    const result = buildCodeflowGuidance(getDefaultCodeflowConfig());

    expect(result.systemPromptAppend).toContain('/flow-start');
    expect(result.systemPromptAppend).toContain('/flow-check');
    expect(result.systemPromptAppend).toContain('/flow-commit');
    expect(result.systemPromptAppend).toContain('/flow-pr');
    expect(result.systemPromptAppend).toContain('when available');
    expect(result.systemPromptAppend).toContain('not implemented yet');
  });

  it('requires structured payloads and template-rendered outputs', () => {
    const result = buildCodeflowGuidance(getDefaultCodeflowConfig());

    expect(result.systemPromptAppend).toContain('Do not manually invent branch');
    expect(result.systemPromptAppend).toContain('Provide structured payloads');
    expect(result.systemPromptAppend).toContain('Let Codeflow render final');
  });

  it('discourages raw git workflow operations', () => {
    const result = buildCodeflowGuidance(getDefaultCodeflowConfig());

    expect(result.systemPromptAppend).toContain(
      'Use Codeflow tools when available instead of raw git workflow operations',
    );
  });

  it('describes safety boundaries as fallback airbags', () => {
    const result = buildCodeflowGuidance(getDefaultCodeflowConfig());

    expect(result.systemPromptAppend).toContain('fallback airbags');
    expect(result.message).toContain('fallback airbags');
  });

  it('warns when package defaults are used', () => {
    const result = buildCodeflowGuidance(getDefaultCodeflowConfig(), {
      usedDefaultConfig: true,
    });

    expect(result.summary.warnings).toContain(
      'No project Codeflow config was found; package defaults are in use.',
    );
    expect(result.message).toContain('package defaults are in use');
  });

  it('warns when the current branch is reserved', () => {
    const result = buildCodeflowGuidance(getDefaultCodeflowConfig(), {
      currentBranch: 'dev',
    });

    expect(result.summary.warnings).toEqual([
      'Current branch dev is reserved; avoid normal workflow changes here.',
    ]);
  });

  it('honors disabled guidance policy flags', () => {
    const config = mergeCodeflowConfig(getDefaultCodeflowConfig(), {
      guidance: {
        proactive: false,
        requireStructuredPayloads: false,
        renderOutputsFromTemplates: false,
        stopForHumanDecisions: false,
      },
    } as Record<string, unknown>);
    const result = buildCodeflowGuidance(config);

    expect(result.systemPromptAppend).not.toContain('- Be proactive:');
    expect(result.systemPromptAppend).not.toContain('- Provide structured payloads');
    expect(result.systemPromptAppend).not.toContain('- Let Codeflow render final');
    expect(result.systemPromptAppend).toContain('Follow the configured lifecycle conservatively');
    expect(result.message).not.toContain('Provide structured payloads when asked');
    expect(result.message).not.toContain('Let templates render final outputs');
    expect(result.message).not.toContain('Stop for required human decisions');
    expect(result.summary.warnings).toEqual(
      expect.arrayContaining([
        'Config guidance.proactive is disabled; keep Codeflow guidance conservative.',
        'Config guidance.requireStructuredPayloads is disabled; do not present structured payloads as mandatory unless explicitly requested.',
        'Config guidance.renderOutputsFromTemplates is disabled; do not present template-rendered outputs as mandatory.',
        'Config guidance.stopForHumanDecisions is disabled; do not present human-decision stops as mandatory guidance unless other policy requires them.',
      ]),
    );
  });
});
