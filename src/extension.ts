import type { LoadCodeflowConfigResult } from './config/load-config';
import { loadCodeflowConfig } from './config/load-config';
import { buildCodeflowGuidance } from './guidance/build-guidance';
import type { CodeflowGuidanceResult } from './guidance/guidance-context';
import { buildCodeflowConfigLoadFailureGuidance } from './guidance/guidance-errors';
import { appendCodeflowGuidanceToSystemPrompt } from './guidance/guidance-format';

export interface CodeflowBeforeAgentStartEvent {
  systemPrompt: string;
  prompt?: string;
  systemPromptOptions?: {
    cwd?: string;
  };
}

export interface CodeflowExtensionContext {
  cwd?: string;
}

export interface CodeflowInjectedMessage {
  customType: 'codeflow-guidance';
  content: string;
  display: true;
  details: CodeflowGuidanceResult['summary'];
}

export interface CodeflowBeforeAgentStartResult {
  systemPrompt: string;
  message: CodeflowInjectedMessage;
}

export interface RegisterCodeflowExtensionOptions {
  loadConfig?: typeof loadCodeflowConfig;
}

interface CodeflowExtensionApi {
  on(
    eventName: 'before_agent_start',
    handler: (
      event: CodeflowBeforeAgentStartEvent,
      context: CodeflowExtensionContext,
    ) => Promise<CodeflowBeforeAgentStartResult>,
  ): void;
}

export async function buildCodeflowBeforeAgentStartResult(
  event: CodeflowBeforeAgentStartEvent,
  context: CodeflowExtensionContext = {},
  options: RegisterCodeflowExtensionOptions = {},
): Promise<CodeflowBeforeAgentStartResult> {
  const cwd = event.systemPromptOptions?.cwd ?? context.cwd ?? process.cwd();
  const loadConfig = options.loadConfig ?? loadCodeflowConfig;
  const guidance = await loadGuidance(loadConfig, cwd);

  return {
    message: {
      customType: 'codeflow-guidance',
      content: guidance.message,
      display: true,
      details: guidance.summary,
    },
    systemPrompt: appendCodeflowGuidanceToSystemPrompt(
      event.systemPrompt,
      guidance.systemPromptAppend,
    ),
  };
}

export function registerCodeflowExtension(
  pi: CodeflowExtensionApi,
  options: RegisterCodeflowExtensionOptions = {},
): void {
  pi.on('before_agent_start', async (event, context) =>
    buildCodeflowBeforeAgentStartResult(event, context, options),
  );
}

export default registerCodeflowExtension;

async function loadGuidance(
  loadConfig: typeof loadCodeflowConfig,
  cwd: string,
): Promise<CodeflowGuidanceResult> {
  try {
    const result: LoadCodeflowConfigResult = await loadConfig({ cwd });

    return buildCodeflowGuidance(result.config, {
      activePhase: 'idle',
      sessionActive: true,
      configPath: result.configPath,
      usedDefaultConfig: result.usedDefaultConfig,
    });
  } catch (error) {
    return buildCodeflowConfigLoadFailureGuidance(error, {
      activePhase: 'blocked',
      sessionActive: true,
    });
  }
}
