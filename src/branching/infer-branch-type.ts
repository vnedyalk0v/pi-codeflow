import type { CodeflowConfig } from '../config/codeflow-config';
import type { BranchType } from './branch-type';
import { validateBranchType } from './branch-type';

export interface InferBranchTypeInput {
  task: string;
  config: Pick<CodeflowConfig, 'branching'>;
  type?: string;
  emergency?: boolean;
}

type BranchTypeRule = {
  type: BranchType;
  patterns: RegExp[];
};

const INFERENCE_RULES: BranchTypeRule[] = [
  {
    type: 'hotfix',
    patterns: [
      /^(hotfix|emergency)\b/,
      /\b(production outage|prod outage|production incident|prod incident)\b/,
      /\b(is down|down in production|broken in production)\b/,
    ],
  },
  {
    type: 'fix',
    patterns: [/^(fix|bug|resolve|repair)\b/, /\b(bug|bugfix|regression)\b/],
  },
  {
    type: 'docs',
    patterns: [/^(docs|doc|document|documentation|readme)\b/, /\breadme\b/],
  },
  {
    type: 'test',
    patterns: [/^(test|tests|coverage|spec|specs)\b/, /\b(test coverage|unit test|integration test)\b/],
  },
  {
    type: 'refactor',
    patterns: [/^(refactor|cleanup|clean up)\b/, /\b(refactor|cleanup|clean up)\b/],
  },
  {
    type: 'perf',
    patterns: [/^(perf|performance|optimize|optimise)\b/, /\b(performance|optimize|optimise|slow)\b/],
  },
  {
    type: 'ci',
    patterns: [/^(ci|workflow|github actions?)\b/, /\b(github actions?|ci workflow|ci pipeline)\b/],
  },
  {
    type: 'build',
    patterns: [/^(build|package|bundle)\b/, /\b(build system|packaging|bundle)\b/],
  },
  {
    type: 'chore',
    patterns: [/^(chore|maintenance)\b/, /\b(maintenance|housekeeping)\b/],
  },
];

export function inferBranchType(input: InferBranchTypeInput): BranchType {
  if (input.type !== undefined) {
    return validateBranchType(input.type, input.config);
  }

  if (input.emergency) {
    return validateBranchType('hotfix', input.config);
  }

  const normalizedTask = normalizeTask(input.task);

  for (const rule of INFERENCE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalizedTask))) {
      return validateBranchType(rule.type, input.config);
    }
  }

  return validateBranchType(input.config.branching.defaultType, input.config);
}

function normalizeTask(task: string): string {
  return task
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[_:;,.!?()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ');
}
