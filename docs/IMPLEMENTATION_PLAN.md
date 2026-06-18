# Implementation Plan After v0.1

Implementation PRs should stay small and target one executable foundation layer
at a time.

## Current implementation PR

Target issue:

- #12 Implement `/flow-pr` with generated PR title/body.

This PR implements the v0.6 pull request foundation. It consumes the validated
config layer from #7, guidance/lifecycle foundation from #8, semantic branch
command foundation from #9, local check runner foundation from #10, and commit
renderer foundation from #11. It adds structured PR payload validation,
deterministic PR title rendering, PR body rendering from templates, GitHub CLI
PR creation/update behavior, base/head branch safety, check-state and
commit-state policy, dry-run previews, draft behavior, and bounded latest PR
metadata.

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

## Implemented #12 scope

- Add `/flow-pr` command registration.
- Validate structured nested PR payloads against schema and semantic rules.
- Render deterministic PR titles from structured title fields.
- Render deterministic PR bodies from the configured PR template.
- Open or update GitHub PRs through `gh pr create` and `gh pr edit`.
- Use explicit `--base`, `--head`, `--title`, and `--body-file` arguments.
- Support dry-run previews without pushing or calling GitHub.
- Support draft and ready PR behavior.
- Refuse reserved head branches and base=head PRs.
- Warn or block based on latest `/flow-check` state policy.
- Warn when latest `/flow-commit` state is missing.
- Store bounded latest PR metadata in session state.
- Add tests for validation, rendering, command behavior, GitHub CLI behavior,
  and state updates.

## Non-goals for #12

- GitHub checks watcher.
- Review comment automation.
- Merge automation.
- Auto-approval.
- Auto-resolving reviewer comments.
- Post-PR CI waiting beyond lightweight next-action guidance.

## Next intended implementation issue

#13 GitHub checks watcher is next after #12. It should build on the bounded PR
metadata produced by `/flow-pr` without adding review comment or merge
automation.

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
- Unit tests for PR payload validation, PR title/body rendering, branch and
  check-state policy, command registration, GitHub CLI integration, dry-run and
  draft behavior, and bounded PR state.
- Manual check that GitHub checks watching, review comment automation,
  auto-approval, merge automation, and branch deletion remain out of scope.
