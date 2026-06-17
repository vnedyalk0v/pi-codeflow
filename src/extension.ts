import type { LoadCodeflowConfigResult } from './config/load-config';
import { loadCodeflowConfig } from './config/load-config';
import {
  FlowStartError,
  formatFlowStartResult,
  parseFlowStartArguments,
  runFlowStart,
  type FlowStartOptions,
  type FlowStartResult,
} from './commands/flow-start';
import {
  formatFlowCheckResult,
  parseFlowCheckArguments,
  runFlowCheck,
  type FlowCheckResult,
} from './commands/flow-check';
import {
  formatFlowCommitResult,
  parseFlowCommitArguments,
  readFlowCommitPayloadFile,
  runFlowCommit,
  type FlowCommitResult,
} from './commands/flow-commit';
import {
  formatFlowPrResult,
  parseFlowPrArguments,
  readFlowPrPayloadFile,
  runFlowPr,
  type FlowPrResult,
} from './commands/flow-pr';
import { CodeflowCheckError } from './checks/check-errors';
import { CodeflowCommitError } from './commits/commit-errors';
import { CodeflowPrError } from './pull-requests/pr-errors';
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
  runFlowStart?: typeof runFlowStart;
  runFlowCheck?: typeof runFlowCheck;
  runFlowCommit?: typeof runFlowCommit;
  runFlowPr?: typeof runFlowPr;
}

export interface CodeflowExtensionCommandContext extends CodeflowExtensionContext {
  cwd: string;
  waitForIdle?: () => Promise<void>;
  ui: {
    notify(message: string, level: 'info' | 'warning' | 'error'): void;
  };
}

interface CodeflowExtensionApi {
  on(
    eventName: 'before_agent_start',
    handler: (
      event: CodeflowBeforeAgentStartEvent,
      context: CodeflowExtensionContext,
    ) => Promise<CodeflowBeforeAgentStartResult>,
  ): void;
  registerCommand?(
    name: 'flow-start' | 'flow-check' | 'flow-commit' | 'flow-pr',
    options: {
      description: string;
      handler: (
        args: string,
        context: CodeflowExtensionCommandContext,
      ) => Promise<FlowStartResult | FlowCheckResult | FlowCommitResult | FlowPrResult>;
    },
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

  pi.registerCommand?.('flow-start', {
    description: 'Start a Codeflow task and prepare a semantic work branch',
    handler: async (args, context) =>
      handleFlowStartCommand(args, context, options.runFlowStart ?? runFlowStart),
  });

  pi.registerCommand?.('flow-check', {
    description: 'Run configured Codeflow local checks and record results',
    handler: async (args, context) =>
      handleFlowCheckCommand(args, context, options.runFlowCheck ?? runFlowCheck),
  });

  pi.registerCommand?.('flow-commit', {
    description: 'Render and create a Codeflow commit from a structured payload',
    handler: async (args, context) =>
      handleFlowCommitCommand(args, context, options.runFlowCommit ?? runFlowCommit),
  });

  pi.registerCommand?.('flow-pr', {
    description: 'Render and open a Codeflow pull request from a structured payload',
    handler: async (args, context) =>
      handleFlowPrCommand(args, context, options.runFlowPr ?? runFlowPr),
  });
}

export default registerCodeflowExtension;

async function handleFlowStartCommand(
  args: string,
  context: CodeflowExtensionCommandContext,
  startFlow: typeof runFlowStart,
): Promise<FlowStartResult> {
  await context.waitForIdle?.();

  try {
    const parsed = parseFlowStartArguments(args ?? '');
    const result = await startFlow({
      cwd: context.cwd,
      ...parsed,
    } satisfies FlowStartOptions);

    context.ui.notify(formatFlowStartResult(result), 'info');
    return result;
  } catch (error) {
    context.ui.notify(getFlowStartErrorMessage(error), 'error');
    throw error;
  }
}

async function handleFlowCheckCommand(
  args: string,
  context: CodeflowExtensionCommandContext,
  checkFlow: typeof runFlowCheck,
): Promise<FlowCheckResult> {
  await context.waitForIdle?.();

  try {
    const parsed = parseFlowCheckArguments(args ?? '');
    const result = await checkFlow({
      cwd: context.cwd,
      ...parsed,
    });

    context.ui.notify(
      formatFlowCheckResult(result),
      result.checkRun.status === 'failed' ? 'warning' : 'info',
    );
    return result;
  } catch (error) {
    context.ui.notify(getFlowCheckErrorMessage(error), 'error');
    throw error;
  }
}

async function handleFlowCommitCommand(
  args: string,
  context: CodeflowExtensionCommandContext,
  commitFlow: typeof runFlowCommit,
): Promise<FlowCommitResult> {
  await context.waitForIdle?.();

  try {
    const parsed = parseFlowCommitArguments(args ?? '');

    if (!parsed.payloadPath) {
      throw new CodeflowCommitError({
        code: 'invalid_arguments',
        message: '/flow-commit requires --payload <path>.',
      });
    }

    const payload = await readFlowCommitPayloadFile(parsed.payloadPath, context.cwd);
    const result = await commitFlow({
      cwd: context.cwd,
      payload,
      dryRun: parsed.dryRun,
      allowUnverified: parsed.allowUnverified,
      allowReservedBranch: parsed.allowReservedBranch,
    });

    context.ui.notify(formatFlowCommitResult(result), 'info');
    return result;
  } catch (error) {
    context.ui.notify(getFlowCommitErrorMessage(error), 'error');
    throw error;
  }
}

async function handleFlowPrCommand(
  args: string,
  context: CodeflowExtensionCommandContext,
  prFlow: typeof runFlowPr,
): Promise<FlowPrResult> {
  await context.waitForIdle?.();

  try {
    const parsed = parseFlowPrArguments(args ?? '');

    if (!parsed.payloadPath) {
      throw new CodeflowPrError({
        code: 'invalid_arguments',
        message: '/flow-pr requires --payload <path>.',
      });
    }

    const payload = await readFlowPrPayloadFile(parsed.payloadPath, context.cwd);
    const result = await prFlow({
      cwd: context.cwd,
      payload,
      dryRun: parsed.dryRun,
      draft: parsed.draft,
      baseBranch: parsed.baseBranch,
      headBranch: parsed.headBranch,
      allowUnverified: parsed.allowUnverified,
      allowReservedHead: parsed.allowReservedHead,
      push: parsed.push,
    });

    context.ui.notify(formatFlowPrResult(result), 'info');
    return result;
  } catch (error) {
    context.ui.notify(getFlowPrErrorMessage(error), 'error');
    throw error;
  }
}

function getFlowStartErrorMessage(error: unknown): string {
  if (error instanceof FlowStartError) {
    return `/flow-start failed: ${error.message}`;
  }

  if (error instanceof Error) {
    return `/flow-start failed: ${error.message}`;
  }

  return '/flow-start failed.';
}

function getFlowCheckErrorMessage(error: unknown): string {
  if (error instanceof CodeflowCheckError) {
    return `/flow-check failed: ${error.message}`;
  }

  if (error instanceof Error) {
    return `/flow-check failed: ${error.message}`;
  }

  return '/flow-check failed.';
}

function getFlowCommitErrorMessage(error: unknown): string {
  if (error instanceof CodeflowCommitError) {
    return `/flow-commit failed: ${error.message}`;
  }

  if (error instanceof Error) {
    return `/flow-commit failed: ${error.message}`;
  }

  return '/flow-commit failed.';
}

function getFlowPrErrorMessage(error: unknown): string {
  if (error instanceof CodeflowPrError) {
    return `/flow-pr failed: ${error.message}`;
  }

  if (error instanceof Error) {
    return `/flow-pr failed: ${error.message}`;
  }

  return '/flow-pr failed.';
}

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
