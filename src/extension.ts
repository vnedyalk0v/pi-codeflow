import type { LoadCodeflowConfigResult } from './config/load-config';
import { loadCodeflowConfig } from './config/load-config';
import {
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
import {
  formatFlowWatchResult,
  parseFlowWatchArguments,
  runFlowWatch,
  type FlowWatchResult,
} from './commands/flow-watch';
import {
  formatFlowCommentsResult,
  parseFlowCommentsArguments,
  runFlowComments,
  type FlowCommentsResult,
} from './commands/flow-comments';
import {
  formatFlowFixCommentsResult,
  parseFlowFixCommentsArguments,
  readReviewFixPayloadFile,
  runFlowFixComments,
  type FlowFixCommentsResult,
} from './commands/flow-fix-comments';
import { CodeflowCommitError } from './commits/commit-errors';
import { CodeflowPrError } from './pull-requests/pr-errors';
import { CodeflowReviewFixError } from './review-comments/review-fix-errors';
import { buildCodeflowGuidance } from './guidance/build-guidance';
import type { CodeflowGuidanceResult } from './guidance/guidance-context';
import { buildCodeflowConfigLoadFailureGuidance } from './guidance/guidance-errors';
import { appendCodeflowGuidanceToSystemPrompt } from './guidance/guidance-format';
import {
  createCodeflowSessionState,
  type CodeflowSessionState,
} from './state/session-state';

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
  runFlowWatch?: typeof runFlowWatch;
  runFlowComments?: typeof runFlowComments;
  runFlowFixComments?: typeof runFlowFixComments;
}

export interface CodeflowExtensionCommandContext extends CodeflowExtensionContext {
  cwd: string;
  waitForIdle?: () => Promise<void>;
  ui: {
    notify(message: string, level: 'info' | 'warning' | 'error'): void;
  };
}

interface CodeflowExtensionSessionStore {
  get(cwd: string): CodeflowSessionState | undefined;
  set(cwd: string, state: CodeflowSessionState): void;
}

type FlowCheckCommandResult = Omit<FlowCheckResult, 'checkRun'> & {
  checkRun: Omit<FlowCheckResult['checkRun'], 'results'> & {
    results: Array<Omit<FlowCheckResult['checkRun']['results'][number], 'stdout' | 'stderr'>>;
  };
};

interface CodeflowExtensionApi {
  on(
    eventName: 'before_agent_start',
    handler: (
      event: CodeflowBeforeAgentStartEvent,
      context: CodeflowExtensionContext,
    ) => Promise<CodeflowBeforeAgentStartResult>,
  ): void;
  registerCommand?(
    name:
      | 'flow-start'
      | 'flow-check'
      | 'flow-commit'
      | 'flow-pr'
      | 'flow-watch'
      | 'flow-comments'
      | 'flow-fix-comments',
    options: {
      description: string;
      handler: (
        args: string,
        context: CodeflowExtensionCommandContext,
      ) => Promise<
        | FlowStartResult
        | FlowCheckCommandResult
        | FlowCommitResult
        | FlowPrResult
        | FlowWatchResult
        | FlowCommentsResult
        | FlowFixCommentsResult
      >;
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
  const sessionStore = createInMemorySessionStore();

  pi.on('before_agent_start', async (event, context) =>
    buildCodeflowBeforeAgentStartResult(event, context, options),
  );

  pi.registerCommand?.('flow-start', {
    description: 'Start a Codeflow task and prepare a semantic work branch',
    handler: async (args, context) =>
      handleFlowStartCommand(args, context, options.runFlowStart ?? runFlowStart, sessionStore),
  });

  pi.registerCommand?.('flow-check', {
    description: 'Run configured Codeflow local checks and record results',
    handler: async (args, context) =>
      handleFlowCheckCommand(args, context, options.runFlowCheck ?? runFlowCheck, sessionStore),
  });

  pi.registerCommand?.('flow-commit', {
    description: 'Render and create a Codeflow commit from a structured payload',
    handler: async (args, context) =>
      handleFlowCommitCommand(args, context, options.runFlowCommit ?? runFlowCommit, sessionStore),
  });

  pi.registerCommand?.('flow-pr', {
    description: 'Render and open a Codeflow pull request from a structured payload',
    handler: async (args, context) =>
      handleFlowPrCommand(args, context, options.runFlowPr ?? runFlowPr, sessionStore),
  });

  pi.registerCommand?.('flow-watch', {
    description: 'Watch GitHub pull request checks and record results',
    handler: async (args, context) =>
      handleFlowWatchCommand(args, context, options.runFlowWatch ?? runFlowWatch, sessionStore),
  });

  pi.registerCommand?.('flow-comments', {
    description: 'List and triage GitHub pull request review threads read-only',
    handler: async (args, context) =>
      handleFlowCommentsCommand(args, context, options.runFlowComments ?? runFlowComments, sessionStore),
  });

  pi.registerCommand?.('flow-fix-comments', {
    description: 'Safely reply to and resolve policy-allowed review threads',
    handler: async (args, context) =>
      handleFlowFixCommentsCommand(args, context, options.runFlowFixComments ?? runFlowFixComments, sessionStore),
  });
}

export default registerCodeflowExtension;

async function handleFlowStartCommand(
  args: string,
  context: CodeflowExtensionCommandContext,
  startFlow: typeof runFlowStart,
  sessionStore: CodeflowExtensionSessionStore,
): Promise<FlowStartResult> {
  await context.waitForIdle?.();

  try {
    const parsed = parseFlowStartArguments(args ?? '');
    const result = await startFlow({
      cwd: context.cwd,
      ...parsed,
    } satisfies FlowStartOptions);

    sessionStore.set(
      context.cwd,
      createCodeflowSessionState({
        phase: result.currentPhase,
        task: result.task,
        baseBranch: result.baseBranch,
        workBranch: result.workBranch,
      }),
    );
    context.ui.notify(formatFlowStartResult(result), 'info');
    return result;
  } catch (error) {
    context.ui.notify(formatCommandError('/flow-start', error), 'error');
    throw error;
  }
}

async function handleFlowCheckCommand(
  args: string,
  context: CodeflowExtensionCommandContext,
  checkFlow: typeof runFlowCheck,
  sessionStore: CodeflowExtensionSessionStore,
): Promise<FlowCheckCommandResult> {
  await context.waitForIdle?.();

  try {
    const parsed = parseFlowCheckArguments(args ?? '');
    const result = await checkFlow({
      cwd: context.cwd,
      ...parsed,
      sessionState: sessionStore.get(context.cwd),
    });

    sessionStore.set(context.cwd, result.sessionState);
    context.ui.notify(
      formatFlowCheckResult(result),
      result.checkRun.status === 'failed' ? 'warning' : 'info',
    );
    return sanitizeFlowCheckCommandResult(result);
  } catch (error) {
    context.ui.notify(formatCommandError('/flow-check', error), 'error');
    throw error;
  }
}

function sanitizeFlowCheckCommandResult(result: FlowCheckResult): FlowCheckCommandResult {
  return {
    ...result,
    checkRun: {
      ...result.checkRun,
      results: result.checkRun.results.map((checkResult) => ({
        name: checkResult.name,
        command: checkResult.command,
        status: checkResult.status,
        exitCode: checkResult.exitCode,
        signal: checkResult.signal,
        startedAt: checkResult.startedAt,
        finishedAt: checkResult.finishedAt,
        durationMs: checkResult.durationMs,
        summary: checkResult.summary,
        required: checkResult.required,
      })),
    },
  };
}

async function handleFlowCommitCommand(
  args: string,
  context: CodeflowExtensionCommandContext,
  commitFlow: typeof runFlowCommit,
  sessionStore: CodeflowExtensionSessionStore,
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
      sessionState: sessionStore.get(context.cwd),
    });

    sessionStore.set(context.cwd, result.sessionState);
    context.ui.notify(formatFlowCommitResult(result), 'info');
    return result;
  } catch (error) {
    context.ui.notify(formatCommandError('/flow-commit', error), 'error');
    throw error;
  }
}

async function handleFlowPrCommand(
  args: string,
  context: CodeflowExtensionCommandContext,
  prFlow: typeof runFlowPr,
  sessionStore: CodeflowExtensionSessionStore,
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
      sessionState: sessionStore.get(context.cwd),
    });

    sessionStore.set(context.cwd, result.sessionState);
    context.ui.notify(formatFlowPrResult(result), 'info');
    return result;
  } catch (error) {
    context.ui.notify(formatCommandError('/flow-pr', error), 'error');
    throw error;
  }
}

async function handleFlowWatchCommand(
  args: string,
  context: CodeflowExtensionCommandContext,
  watchFlow: typeof runFlowWatch,
  sessionStore: CodeflowExtensionSessionStore,
): Promise<FlowWatchResult> {
  await context.waitForIdle?.();

  try {
    const parsed = parseFlowWatchArguments(args ?? '');
    const result = await watchFlow({
      cwd: context.cwd,
      ...parsed,
      sessionState: sessionStore.get(context.cwd),
    });

    sessionStore.set(context.cwd, result.sessionState);
    context.ui.notify(
      formatFlowWatchResult(result),
      result.checks.status === 'failed' || result.checks.status === 'unknown' ? 'warning' : 'info',
    );
    return result;
  } catch (error) {
    context.ui.notify(formatCommandError('/flow-watch', error), 'error');
    throw error;
  }
}

async function handleFlowCommentsCommand(
  args: string,
  context: CodeflowExtensionCommandContext,
  commentsFlow: typeof runFlowComments,
  sessionStore: CodeflowExtensionSessionStore,
): Promise<FlowCommentsResult> {
  await context.waitForIdle?.();

  try {
    const parsed = parseFlowCommentsArguments(args ?? '');
    const result = await commentsFlow({
      cwd: context.cwd,
      ...parsed,
      sessionState: sessionStore.get(context.cwd),
    });

    sessionStore.set(context.cwd, result.sessionState);
    context.ui.notify(
      formatFlowCommentsResult(result),
      result.lifecyclePhase === 'blocked' ? 'warning' : 'info',
    );
    return result;
  } catch (error) {
    context.ui.notify(formatCommandError('/flow-comments', error), 'error');
    throw error;
  }
}

async function handleFlowFixCommentsCommand(
  args: string,
  context: CodeflowExtensionCommandContext,
  fixCommentsFlow: typeof runFlowFixComments,
  sessionStore: CodeflowExtensionSessionStore,
): Promise<FlowFixCommentsResult> {
  await context.waitForIdle?.();

  try {
    const parsed = parseFlowFixCommentsArguments(args ?? '');

    if (!parsed.payloadPath) {
      throw new CodeflowReviewFixError({
        code: 'invalid_arguments',
        message: '/flow-fix-comments requires --payload <path>.',
      });
    }

    const payload = await readReviewFixPayloadFile(parsed.payloadPath, context.cwd);
    const result = await fixCommentsFlow({
      cwd: context.cwd,
      payload,
      dryRun: parsed.dryRun,
      applyReplies: parsed.applyReplies,
      applyResolutions: parsed.applyResolutions,
      apply: parsed.apply,
      allowInvalidResolution: parsed.allowInvalidResolution,
      detached: parsed.detached,
      pr: parsed.pr,
      sessionState: sessionStore.get(context.cwd),
    });

    sessionStore.set(context.cwd, result.sessionState);
    context.ui.notify(
      formatFlowFixCommentsResult(result),
      result.lifecyclePhase === 'blocked' ? 'warning' : 'info',
    );
    return result;
  } catch (error) {
    context.ui.notify(formatCommandError('/flow-fix-comments', error), 'error');
    throw error;
  }
}

function createInMemorySessionStore(): CodeflowExtensionSessionStore {
  const sessions = new Map<string, CodeflowSessionState>();

  return {
    get(cwd) {
      return sessions.get(cwd);
    },
    set(cwd, state) {
      sessions.set(cwd, state);
    },
  };
}

function formatCommandError(command: string, error: unknown): string {
  return error instanceof Error
    ? `${command} failed: ${error.message}`
    : `${command} failed.`;
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
