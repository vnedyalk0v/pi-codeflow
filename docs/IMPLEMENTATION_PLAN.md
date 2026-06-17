# Implementation Plan After v0.1

Implementation PRs should stay small and target one executable foundation layer
at a time.

## Current implementation PR

Target issue:

- #11 Implement `/flow-commit` with generated commit messages.

This PR implements the v0.6 commit foundation. It consumes the validated config
layer from #7, guidance/lifecycle foundation from #8, semantic branch command
foundation from #9, and local check runner foundation from #10. It adds
structured commit payload validation, deterministic commit message rendering,
Conventional Commit-compatible titles, safe staged-change commit execution,
check-state policy, dry-run previews, and bounded latest commit metadata.

## Implemented #7 scope

- Add minimal TypeScript project foundation.
- Load package defaults from `config/default.codeflow.json`.
- Load optional `.pi/codeflow.json` from the target project.
- Merge project config over defaults with conservative semantics.
- Validate the resolved config against `schemas/codeflow.schema.json`.
- Surface clear typed load and validation errors.
- Add unit tests for default loading, project loading, merge behavior, schema
  validation, and conditional fallback requirements.

## Implemented #8 scope

- Build Codeflow guidance from loaded config.
- Inject guidance with Pi `before_agent_start`.
- Provide a safe warning path when config loading fails.
- Add a minimal lifecycle phase and state helper foundation.
- Return next expected actions for lifecycle phases.
- Add unit tests for guidance, lifecycle behavior, and extension injection.
- Update docs for the implemented v0.3 scope.

## Implemented #9 scope

- Add `/flow-start` command registration.
- Add deterministic branch type inference and explicit type validation.
- Render semantic branch names from config/template rules.
- Detect tickets from `branching.ticketPattern` or explicit `--ticket`.
- Select base branches from configured policy, preferring `origin/<base>`.
- Prevent dirty working tree branch preparation.
- Keep reserved branches out of normal Codeflow work branches.
- Return lifecycle phase `branch_prepared` with next expected actions.
- Add tests for branching, command behavior, git integration, and safety cases.

## Implemented #10 scope

- Add `/flow-check` command registration.
- Run configured checks in order from validated config.
- Capture status, exit code, signal, stdout, stderr, duration, and summaries.
- Support dry-run, stop-on-failure, continue-on-failure, timeout, optional
  checks, and empty-check behavior.
- Store latest bounded check results in Codeflow session-state output.
- Move failed required checks toward `fixing_local_findings`.
- Add tests and docs for check runner behavior.

## Implemented #11 scope

- Add `/flow-commit` command registration.
- Validate structured commit payloads against schema and semantic rules.
- Render commit messages from the configured commit template.
- Generate Conventional Commit-compatible titles with optional scope and breaking
  marker.
- Require commit bodies with Context, Changes, Verification, and Risk sections.
- Commit staged changes using a temporary rendered message file.
- Refuse no-staged-change commits and reserved-branch commits by default.
- Warn when unstaged or untracked files are present.
- Apply latest `/flow-check` state policy before committing.
- Support dry-run previews without creating commits.
- Store bounded latest commit metadata in session state.
- Add tests for validation, rendering, git behavior, command behavior, and state
  updates.

## Non-goals for #11

- `/flow-pr` implementation.
- PR title/body generation.
- GitHub checks watcher.
- Review comment automation.
- Merge automation.
- Broad branch protection or tool-call blocking beyond `/flow-commit` safety.

## Next intended implementation issue

#12 Implement `/flow-pr` with generated PR title/body is next after #11. It
should build on the structured payload and template-rendering pattern introduced
by `/flow-commit` without changing `/flow-commit` scope.

There is not currently a dedicated self-review issue; self-review remains future
work before Codeflow should claim full pre-commit verification automation.

## Verification expectations

- Unit tests for config loading and validation.
- Unit tests for generated guidance and safe config-load failure behavior.
- Unit tests for lifecycle state creation and next expected actions.
- Unit tests for branch type inference, branch name rendering, branch policy,
  reserved branch behavior, base branch behavior, dirty tree protection, and the
  `/flow-start` command registration.
- Unit tests for ordered check execution, stdout/stderr capture, exit codes,
  durations, failure policy, timeouts, dry-run, empty-check behavior, summaries,
  command registration, lifecycle phase selection, and bounded state storage.
- Unit tests for commit payload validation, template rendering, Conventional
  Commit title generation, staged-change safety, check-state policy, command
  registration, git commit execution, and bounded commit state.
- Manual check that PR generation, GitHub automation, review comment automation,
  and merge automation remain out of scope.
