import type { CodeflowConfig } from '../config/codeflow-config';
import { BranchPolicyError } from './branch-errors';
import type { BranchType } from './branch-type';
import {
  getDefaultBranchTemplatePattern,
  renderBranchTemplate,
} from './branch-template';

export interface BranchNameInput {
  type: BranchType;
  task: string;
  config: Pick<CodeflowConfig, 'branching'>;
  ticket?: string | null;
  templatePattern?: string;
  branchExists?: (branchName: string) => boolean | Promise<boolean>;
}

export async function renderBranchName(input: BranchNameInput): Promise<string> {
  const ticket = normalizeTicket(
    input.ticket ?? extractTicketFromTask(input.task, input.config) ?? null,
  );
  const slug = slugifyTask(input.task, input.config, ticket);
  const baseBranchName = renderBranchNameCandidate(input, slug, ticket);

  return resolveBranchNameCollision(input, baseBranchName);
}

export function extractTicketFromTask(
  task: string,
  config: Pick<CodeflowConfig, 'branching'>,
): string | null {
  const pattern = config.branching.ticketPattern;

  if (!pattern) {
    return null;
  }

  let matcher: RegExp;

  try {
    matcher = new RegExp(pattern);
  } catch (error) {
    throw new BranchPolicyError({
      code: 'invalid_ticket_pattern',
      message: `Invalid branching.ticketPattern regular expression: ${pattern}`,
      details: { ticketPattern: pattern },
      cause: error,
    });
  }

  return task.match(matcher)?.[0] ?? null;
}

export function slugifyTask(
  task: string,
  config: Pick<CodeflowConfig, 'branching'>,
  ticket?: string | null,
): string {
  let slugSource = task;

  if (ticket) {
    slugSource = slugSource.replaceAll(ticket, ' ');
  }

  const slug = slugSource
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const trimmedSlug = trimSlug(slug, config.branching.slug.maxLength);

  if (!isUsefulSlug(trimmedSlug)) {
    throw new BranchPolicyError({
      code: 'empty_branch_slug',
      message:
        'Task description does not contain enough useful words for a semantic branch name. Provide a more specific task description.',
      details: { task },
    });
  }

  return trimmedSlug;
}

function renderBranchNameCandidate(
  input: BranchNameInput,
  slug: string,
  ticket: string | null,
): string {
  const templatePattern = input.templatePattern ?? getDefaultBranchTemplatePattern();
  const ticketForTemplate = input.config.branching.slug.ticketPrefixAllowed ? ticket : null;
  const branchName = renderBranchTemplate(templatePattern, {
    type: input.type,
    slug,
    ticket: ticketForTemplate,
  })
    .replace(/\n+/g, '')
    .replace(/\/+/g, '/')
    .replace(/^-|-$/g, '');

  if (branchName.length === 0 || !branchName.includes('/')) {
    throw new BranchPolicyError({
      code: 'empty_branch_slug',
      message: `Branch template did not produce a semantic branch path for task: ${input.task}`,
      details: { task: input.task, templatePattern },
    });
  }

  return branchName;
}

async function resolveBranchNameCollision(
  input: BranchNameInput,
  baseBranchName: string,
): Promise<string> {
  const branchExists = input.branchExists ?? (async () => false);

  if (!(await branchExists(baseBranchName))) {
    return baseBranchName;
  }

  const collisionSuffix = input.config.branching.slug.collisionSuffix;

  if (collisionSuffix === 'block') {
    throw new BranchPolicyError({
      code: 'branch_name_collision',
      message: `Branch already exists and collision policy is block: ${baseBranchName}`,
      details: { branchName: baseBranchName },
    });
  }

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${baseBranchName}-${suffix}`;

    if (!(await branchExists(candidate))) {
      return candidate;
    }
  }

  throw new BranchPolicyError({
    code: 'branch_name_collision',
    message: `Could not find an available collision suffix for ${baseBranchName}.`,
    details: { branchName: baseBranchName },
  });
}

function normalizeTicket(ticket: string | null): string | null {
  const normalized = ticket?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function trimSlug(slug: string, maxLength: number): string {
  return slug.slice(0, maxLength).replace(/-+$/g, '');
}

function isUsefulSlug(slug: string): boolean {
  if (slug.length === 0) {
    return false;
  }

  const genericSlugs = new Set([
    'task',
    'todo',
    'work',
    'change',
    'changes',
    'update',
    'misc',
    'stuff',
    'fix',
    'bug',
    'issue',
  ]);

  return !genericSlugs.has(slug);
}
