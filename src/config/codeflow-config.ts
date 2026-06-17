import type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';

export type { CodeflowLifecyclePhase } from '../lifecycle/lifecycle-phase';

export type CodeflowBranchType =
  | 'feat'
  | 'fix'
  | 'hotfix'
  | 'refactor'
  | 'perf'
  | 'docs'
  | 'test'
  | 'chore'
  | 'ci'
  | 'build'
  | 'revert';

export type CodeflowReviewClassification =
  | 'valid'
  | 'invalid'
  | 'stale'
  | 'already_fixed'
  | 'needs_human';

export type CodeflowReviewAutoResolveReason = 'fixed' | 'stale' | 'already_fixed';

export type CodeflowEmergencyPath = 'hotfix_branch' | 'human_only';

export interface CodeflowBaseBranchesConfig {
  default: string;
  allowed: string[];
  fallback?: string;
  missingDefaultBehavior: 'block' | 'fallback';
}

export interface CodeflowBranchingConfig {
  allowedTypes: CodeflowBranchType[];
  defaultType: CodeflowBranchType;
  template: string;
  ticketPattern?: string;
  slug: {
    case: 'kebab';
    maxLength: number;
    ticketPrefixAllowed: boolean;
    collisionSuffix: 'increment' | 'short-sha' | 'block';
  };
}

export interface CodeflowCommitsConfig {
  template: string;
  conventional: boolean;
  allowedTypes: CodeflowBranchType[];
  requireStructuredPayload: boolean;
  performCommit: boolean;
}

export interface CodeflowPullRequestConfig {
  template: string;
  baseBranch: string;
  draftByDefault: boolean;
  requireSelfReview: boolean;
  openWhenChecksFail: boolean;
  updateExisting: boolean;
}

export interface CodeflowCheckConfig {
  name: string;
  command: string;
  cwd?: string;
  timeoutMs?: number;
  timeoutSeconds?: number;
  required?: boolean;
}

export interface CodeflowReviewCommentsConfig {
  classifications: CodeflowReviewClassification[];
  autoResolveWhen: CodeflowReviewAutoResolveReason[];
  resolveValidOnlyAfterFix: boolean;
  invalidRequiresHumanReview: boolean;
  needsHumanBlocks: boolean;
}

export interface CodeflowEmergencyConfig {
  enabled: boolean;
  defaultPath: CodeflowEmergencyPath;
  allowReservedBranchWork: boolean;
  requireReason: boolean;
  requireFinalReport: boolean;
  requireStructuredCommitAndPr: boolean;
  documentBackportToDev: boolean;
}

export interface CodeflowTemplatesConfig {
  branchName: string;
  commitMessage: string;
  pullRequest: string;
  reviewReply: string;
  finalReport: string;
}

export interface CodeflowGuidanceConfig {
  proactive: boolean;
  requireStructuredPayloads: boolean;
  renderOutputsFromTemplates: boolean;
  stopForHumanDecisions: boolean;
  trackedPhases: CodeflowLifecyclePhase[];
}

export interface CodeflowSafetyConfig {
  blockDirectWorkOnReservedBranches: boolean;
  allowDestructiveGitOperations: boolean;
  allowForcePush: boolean;
  allowDirectPushToRemote: boolean;
  requireCleanWorkingTreeForStart: boolean;
  redactSecretsFromReports: boolean;
}

export interface CodeflowConfig {
  $schema?: string;
  extends?: string;
  reservedBranches: string[];
  baseBranches: CodeflowBaseBranchesConfig;
  branching: CodeflowBranchingConfig;
  commits: CodeflowCommitsConfig;
  pullRequest: CodeflowPullRequestConfig;
  checks: CodeflowCheckConfig[];
  reviewComments: CodeflowReviewCommentsConfig;
  emergency: CodeflowEmergencyConfig;
  templates: CodeflowTemplatesConfig;
  guidance: CodeflowGuidanceConfig;
  safety: CodeflowSafetyConfig;
}
