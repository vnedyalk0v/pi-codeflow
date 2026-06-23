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

export type CodeflowReviewAutoResolveClassification = Exclude<
  CodeflowReviewClassification,
  'needs_human'
>;

export type CodeflowReviewProvider = 'github-graphql';

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
    collisionSuffix: 'increment' | 'block';
  };
}

export type CodeflowCommitTitleLengthPolicy = 'error' | 'warning';
export type CodeflowPrTitleLengthPolicy = 'error' | 'warning';

export interface CodeflowCommitsConfig {
  template: string;
  conventional: boolean;
  allowedTypes: CodeflowBranchType[];
  requireStructuredPayload: boolean;
  performCommit: boolean;
  requireBody: boolean;
  requireVerification: boolean;
  requireRisk: boolean;
  maxTitleLength: number;
  titleLengthPolicy: CodeflowCommitTitleLengthPolicy;
  useBreakingChangeMarker: boolean;
  allowUnverifiedCommits: boolean;
  requirePassedChecksBeforeCommit: boolean;
}

export interface CodeflowPullRequestConfig {
  template: string;
  titleTemplate: string;
  baseBranch: string;
  draftByDefault: boolean;
  requireVerification: boolean;
  requireSelfReview: boolean;
  openWhenChecksFail: boolean;
  updateExisting: boolean;
  maxTitleLength: number;
  titleLengthPolicy: CodeflowPrTitleLengthPolicy;
  requirePassedChecksBeforePr: boolean;
  pushBeforeCreate: boolean;
  linkKeyword: 'Refs';
  watchRequiredChecksOnly: boolean;
  checksWatchIntervalSeconds: number;
  checksWatchTimeoutSeconds: number;
  failFast: boolean;
}

export interface CodeflowCheckConfig {
  name: string;
  command: string;
  cwd?: string;
  timeoutMs?: number;
  required?: boolean;
}

export interface CodeflowReviewCommentsConfig {
  enabled: boolean;
  provider: CodeflowReviewProvider;
  includeAuthors: string[];
  excludeAuthors: string[];
  unresolvedOnly: boolean;
  includeOutdated: boolean;
  autoReply: boolean;
  autoResolve: boolean;
  autoResolveClassifications: CodeflowReviewAutoResolveClassification[];
  requireChecksBeforeResolve: boolean;
  requireHumanForInvalid: boolean;
  requireHumanForNeedsHuman: boolean;
  maxThreadsPerRun: number;
  replyTemplate: string;
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
  requireCleanWorkingTreeForStart: boolean;
}

export interface CodeflowConfig {
  $schema?: string;
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
