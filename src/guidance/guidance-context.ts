import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';

export interface CodeflowGuidanceContext {
  cwd?: string;
  currentBranch?: string | null;
  activePhase?: CodeflowLifecyclePhase;
  sessionActive?: boolean;
  configPath?: string | null;
  usedDefaultConfig?: boolean;
}

export interface CodeflowGuidanceSummary {
  reservedBranches: string[];
  baseBranch: string;
  activePhase: CodeflowLifecyclePhase;
  expectedTools: string[];
  warnings: string[];
}

export interface CodeflowGuidanceResult {
  systemPromptAppend: string;
  message: string;
  summary: CodeflowGuidanceSummary;
}
