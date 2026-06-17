# Product Requirements Document: pi-codeflow

## Problem statement

AI coding agents often perform useful work, but they vary in how they create
branches, plan implementation, run checks, write commits, open pull requests,
handle reviewer comments, and summarize delivery. This inconsistency creates
review overhead, unsafe git behavior, incomplete verification, and hard-to-audit
results.

pi-codeflow should provide a conservative, model-neutral workflow package for Pi
Coding Agent that standardizes the full coding lifecycle without replacing human
judgment.

## Background

The initial repository bootstrap created the package skeleton, planning docs,
prompts, templates, config examples, schemas, issue forms, labels, and GitHub
Project. The next step is to harden the specification so implementation PRs can
be small, reviewable, and tied to explicit behavior.

The package should prevent workflow mistakes by design. It should proactively
guide AI agents through the expected path instead of mainly blocking them after
mistakes. Safety boundaries still matter, but they are fallback airbags for cases
where an agent or tool attempts to leave the expected workflow.

## Target users

- Developers using Pi Coding Agent for day-to-day code changes.
- Maintainers who want consistent AI-generated branches, commits, PRs, and
  reports.
- Teams experimenting with AI-assisted development workflows.
- Open-source contributors who need clear expectations before submitting changes.
- Reviewers who need evidence that checks, self-review, and comment triage were
  performed.

## User scenarios

### Start a normal feature task

A developer asks an agent to implement a linked issue. Codeflow classifies the
task, prepares a semantic branch from the configured base branch, requests a
plan, and keeps the agent inside the documented lifecycle.

### Prepare a commit

An agent finishes a small diff. Codeflow asks the agent to analyze the staged
diff and return a structured commit payload. Codeflow renders the final commit
message from a template and performs the commit.

### Open a pull request

An agent has a verified branch. Codeflow requests a structured PR payload,
renders the PR title/body from templates, opens or updates the PR, and records
verification details.

### Handle review comments

A reviewer leaves comments. Codeflow lists unresolved comments, asks the agent to
classify each one, guides fixes for valid comments, and resolves comments only
when policy allows.

### Emergency hotfix

A maintainer requests urgent work. Codeflow prefers a `hotfix/` branch, requires
an explicit emergency reason, still uses structured commits and PRs, and records
follow-up backport notes.

## Goals

- Guide agents through semantic branch creation, planning, checks, self-review,
  commits, PRs, CI tracking, review comment triage, fix loops, and final reports.
- Require agents to provide structured payloads for workflow artifacts.
- Render branch names, commit messages, PR bodies, review replies, and final
  reports from templates.
- Provide configurable defaults that work across many project types.
- Keep rendered outputs template-based and auditable.
- Avoid destructive git behavior by default.
- Support GitHub workflows without requiring secrets for normal use.
- Preserve human review and merge authority outside the package.

## Non-goals

- Implementing production extension behavior in v0.1.
- Replacing maintainers, reviewers, release managers, security owners, or product
  owners.
- Enforcing every team policy without project-specific configuration.
- Supporting every forge provider in the MVP.
- Publishing packages before release readiness.
- Automatically merging PRs.
- Automatically approving risky reviewer comments or security-sensitive changes.

## Product principles

1. **Proactive guidance first.** The normal UX should steer agents into the right
   workflow before mistakes happen.
2. **Structured payloads over prose.** Agents describe intent and evidence in
   structured payloads; Codeflow renders final artifacts.
3. **Templates are the output boundary.** Branch names, commit messages, PR
   bodies, review replies, and final reports come from templates.
4. **Safety boundaries are airbags.** They catch off-path behavior but are not the
   primary user experience.
5. **Human authority remains external.** Review, merge, release, credential, and
   policy decisions stay with humans unless explicitly delegated.
6. **Model neutrality.** The package should not rely on provider-specific
   behavior or hidden instructions.
7. **Conservative defaults.** Missing config should prefer blocking or asking over
   guessing when safety is involved.

## Core workflow

1. Start from a task or issue.
2. Classify the task type and choose a semantic branch.
3. Prepare a branch from the configured base branch.
4. Plan the implementation.
5. Implement changes in small steps.
6. Run configured checks.
7. Self-review the diff.
8. Fix local findings.
9. Produce a structured commit payload.
10. Render and create a templated commit.
11. Produce a structured PR payload.
12. Render and open or update a templated PR.
13. Watch CI.
14. Triage reviewer comments.
15. Fix valid comments.
16. Re-run checks.
17. Reply and resolve addressed or stale comments according to policy.
18. Produce a final delivery report.

## MVP scope

v0.1 is a specification milestone. It includes:

- Configuration schema and defaults.
- Workflow lifecycle and state machine.
- Semantic branch policy.
- Check runner interface shape.
- Structured payloads for commits, PRs, review triage, and final reports.
- Template rendering expectations for commits, PRs, review replies, and final
  reports.
- GitHub CLI based PR and issue integration expectations.
- Conservative safety boundaries for reserved branches and destructive
  operations.

## Future scope

- Config loader and schema validation.
- Guidance injection into Pi agent context.
- Lifecycle state persistence.
- Semantic branch creation tooling.
- Local check runner.
- Templated commit and PR tooling.
- GitHub checks watcher.
- Review comment triage and fix loop tooling.
- Rich session state visualization.
- Multi-forge support.
- Policy packs for common repository types.
- Optional custom project fields for GitHub Projects.
- Release automation after implementation stabilizes.

## Functional requirements

- Load default configuration and merge project configuration from
  `.pi/codeflow.json`.
- Validate configuration against a JSON schema before workflow commands run.
- Detect reserved branches and prevent normal AI work directly on them.
- Generate semantic branch metadata from task context.
- Render branch names from the configured branch template.
- Run configured checks in order and store results in session state.
- Ask the agent for structured payloads instead of freeform commit or PR text.
- Render final commit messages and PR bodies from templates.
- List and classify unresolved review comments.
- Resolve comments only after they are addressed or proven stale/already fixed.
- Produce final reports with changed files, checks, issues, review comments,
  decisions, and risks.

## Non-functional requirements

- Be model-neutral and readable.
- Keep defaults conservative.
- Avoid hidden behavior and unexpected side effects.
- Prefer small, composable commands.
- Work without runtime dependencies until implementation requires them.
- Keep output deterministic enough for review.
- Provide useful errors for invalid config or unsafe state.
- Make behavior testable before release readiness.

## Safety requirements

- No destructive git operations by default.
- No direct normal work on reserved branches.
- No force-push by default.
- No direct remote push to reserved branches by default.
- Emergency overrides require an explicit reason and final report.
- Emergency commits and PRs still use structured payloads.
- No secret access for normal operation.
- Check output and reports should redact likely secrets.
- Clear warnings when behavior cannot be safely automated.

## Configuration requirements

- Support reserved branches.
- Support default, allowed, and fallback base branches.
- Support allowed branch types and branch templates.
- Support slug validation rules.
- Support commit, PR, review reply, and final report templates.
- Support ordered check commands.
- Support review comment classifications and resolution rules.
- Support emergency override policy.
- Support guidance flags that require structured payloads and template rendering.
- Support safety flags for destructive operations, force push, direct push, clean
  working tree, and secret redaction.

## Success metrics

- Maintainers can understand the workflow from docs alone.
- Initial implementation issues can be scoped without redesigning v0.1 behavior.
- Agents produce consistent branch, commit, PR, and final report artifacts.
- Config examples and schemas describe the same top-level keys.
- Review comments are handled with explicit classifications.
- Safety boundaries are documented before production use.
- No production extension logic is added before the spec foundation is reviewed.

## Open questions

- Which state should live in Pi session entries versus repository files?
- Should command execution use only GitHub CLI in MVP?
- How should Codeflow behave in repositories without a `dev` branch?
- What is the minimum template language needed?
- Which project settings should be configurable versus hard-coded defaults?
- Should review comment resolution require explicit human confirmation in the
  first implementation?
- How should shell command timeouts be configured and reported?
