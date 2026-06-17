import { describe, expect, it } from 'vitest';

import { CodeflowConfigLoadError } from '../../src/config/config-errors';
import {
  buildCodeflowBeforeAgentStartResult,
  registerCodeflowExtension,
  type CodeflowBeforeAgentStartEvent,
  type CodeflowBeforeAgentStartResult,
  type CodeflowExtensionContext,
} from '../../src/extension';
import {
  getDefaultCodeflowConfig,
  type LoadCodeflowConfigOptions,
  type LoadCodeflowConfigResult,
} from '../../src/index';

function defaultLoadResult(): LoadCodeflowConfigResult {
  return {
    config: getDefaultCodeflowConfig(),
    configPath: null,
    usedDefaultConfig: true,
    validationWarnings: [],
  };
}

describe('Codeflow guidance injection extension', () => {
  it('registers a before_agent_start handler that builds guidance', async () => {
    let handler:
      | ((
          event: CodeflowBeforeAgentStartEvent,
          context: CodeflowExtensionContext,
        ) => Promise<CodeflowBeforeAgentStartResult>)
      | undefined;

    registerCodeflowExtension(
      {
        on(eventName, nextHandler) {
          expect(eventName).toBe('before_agent_start');
          handler = nextHandler;
        },
      },
      {
        loadConfig: async () => defaultLoadResult(),
      },
    );

    expect(handler).toBeDefined();
    const result = await handler?.({ systemPrompt: 'base' }, { cwd: '/tmp/project' });

    expect(result?.systemPrompt).toContain('base');
    expect(result?.systemPrompt).toContain('Codeflow is active');
    expect(result?.message.customType).toBe('codeflow-guidance');
  });

  it('calls the config loader with cwd from system prompt options', async () => {
    const calls: LoadCodeflowConfigOptions[] = [];
    const result = await buildCodeflowBeforeAgentStartResult(
      {
        systemPrompt: 'base',
        systemPromptOptions: { cwd: '/tmp/codeflow-project' },
      },
      { cwd: '/tmp/fallback' },
      {
        loadConfig: async (options: LoadCodeflowConfigOptions = {}) => {
          calls.push(options);
          return defaultLoadResult();
        },
      },
    );

    expect(calls).toEqual([{ cwd: '/tmp/codeflow-project' }]);
    expect(result.message.content).toContain('Codeflow is active');
  });

  it('injects Codeflow guidance into both message and system prompt', async () => {
    const result = await buildCodeflowBeforeAgentStartResult(
      { systemPrompt: 'base prompt' },
      { cwd: '/tmp/project' },
      { loadConfig: async () => defaultLoadResult() },
    );

    expect(result.systemPrompt).toContain('base prompt');
    expect(result.systemPrompt).toContain('## Codeflow guidance');
    expect(result.message.content).toContain('Use Codeflow tools when available');
    expect(result.message.details.baseBranch).toBe('dev');
  });

  it('injects warning guidance instead of throwing when config loading fails', async () => {
    const result = await buildCodeflowBeforeAgentStartResult(
      { systemPrompt: 'base prompt' },
      { cwd: '/tmp/project' },
      {
        loadConfig: async () => {
          throw new CodeflowConfigLoadError({
            code: 'validation_failed',
            message: 'Raw path details should not be needed by guidance.',
          });
        },
      },
    );

    expect(result.systemPrompt).toContain('Codeflow guidance warning');
    expect(result.message.content).toContain('Codeflow config could not be loaded');
    expect(result.message.content).toContain('Do not perform workflow-changing operations');
    expect(result.message.details.activePhase).toBe('blocked');
    expect(result.message.details.warnings[0]).toBe(
      'Codeflow config load failed with code validation_failed.',
    );
  });
});
