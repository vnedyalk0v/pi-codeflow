# Product Requirements Document: pi-codeflow

## Problem statement

AI coding agents often perform useful work but vary in how they create branches, plan implementation, run checks, write commits, open pull requests, handle reviewer comments, and summarize delivery. This inconsistency creates review overhead, unsafe git behavior, incomplete verification, and hard-to-audit results.

pi-codeflow should provide a conservative, model-neutral workflow package for Pi Coding Agent that standardizes the full coding lifecycle without replacing human judgment.

## Target users

- Developers using Pi Coding Agent for day-to-day code changes.
- Maintainers who want consistent AI-generated branches, commits, PRs, and reports.
- Teams experimenting with AI-assisted development workflows.
- Open-source contributors who need clear expectations before submitting changes.

## Goals

- Guide agents through semantic branch creation, planning, checks, self-review, commits, PRs, CI tracking, review comment triage, fix loops, and final reports.
- Provide configurable defaults that work across many project types.
- Keep rendered outputs template-based and auditable.
- Avoid destructive git behavior by default.
- Support GitHub workflows without requiring secrets for normal use.

## Non-goals

- Implementing production extension behavior in the repository foundation milestone.
- Replacing maintainers, reviewers, or security owners.
- Enforcing every team policy without project-specific configuration.
- Supporting every forge provider in the MVP.
- Publishing packages before release readiness.

## Core workflow

1. Start from a task or issue.
2. Classify the task type and choose a semantic branch.
3. Plan the implementation.
4. Implement changes in small steps.
5. Run configured checks.
6. Self-review the diff.
7. Fix local findings.
8. Render and create a templated commit.
9. Render and open a templated PR.
10. Watch CI.
11. Triage reviewer comments.
12. Fix valid comments.
13. Re-run checks.
14. Reply and resolve addressed comments.
15. Produce a final delivery report.

## MVP scope

- Configuration schema and defaults.
- Workflow guidance injection.
- Semantic branch policy.
- Check runner interface.
- Structured payloads for commits, PRs, review triage, and final reports.
- Template rendering for commits, PRs, review replies, and final reports.
- GitHub CLI based PR and issue integration where possible.
- Conservative safety boundaries for reserved branches and destructive operations.

## Future scope

- Rich session state visualization.
- Multi-forge support.
- Policy packs for common repository types.
- Optional custom project fields for GitHub Projects.
- Release automation after implementation stabilizes.
- Additional prompts and templates for specialized workflows.

## Functional requirements

- Load default configuration and merge project configuration from `.pi/codeflow.json`.
- Validate configuration against a JSON schema.
- Detect reserved branches and prevent normal AI work directly on them.
- Generate semantic branch metadata from task context.
- Run configured checks in order and store results in session state.
- Ask the agent for structured payloads instead of freeform commit or PR text.
- Render final commit messages and PR bodies from templates.
- List and classify unresolved review comments.
- Resolve comments only after they are addressed or proven stale/already fixed.
- Produce final reports with changed files, checks, issues, and risks.

## Non-functional requirements

- Be model-neutral and readable.
- Keep defaults conservative.
- Avoid hidden behavior and unexpected side effects.
- Prefer small, composable commands.
- Work without runtime dependencies until implementation requires them.
- Keep output deterministic enough for review.

## Safety requirements

- No destructive git operations by default.
- No direct normal work on reserved branches.
- Emergency overrides require an explicit reason and final report.
- No secret access for normal operation.
- Clear warnings when behavior cannot be safely automated.

## Configuration requirements

- Support reserved branches.
- Support default and allowed base branches.
- Support allowed branch types and branch templates.
- Support commit, PR, review reply, and final report templates.
- Support ordered check commands.
- Support review comment classifications.
- Support emergency override policy.

## Success criteria

- Maintainers can understand the workflow from docs alone.
- Agents produce consistent branch, commit, PR, and final report artifacts.
- The MVP can run configured checks and summarize failures.
- Review comments are handled with explicit classifications.
- Safety boundaries are documented and tested before production use.

## Open questions

- Which state should live in Pi session entries versus repository files?
- Should command execution use only GitHub CLI in MVP?
- How should Codeflow behave in repositories without a `dev` branch?
- What is the minimum template language needed?
- Which project settings should be configurable versus hard-coded defaults?
