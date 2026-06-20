# Implementation Plan After v0.1

Implementation PRs should stay small and target one executable foundation layer
at a time.

## Current design-hardening PR

Target issue:

- #14 Implement review comments triage loop.

This PR prepares #14 for implementation. It is design/spec only and does not add
`/flow-comments`, `/flow-fix-comments`, review-thread replies, review-thread
resolution, automatic code fixes, runtime dependencies, or merge automation.

Design scope:

- clarify GitHub PR issue comments, inline review comments, and review threads;
- define a GraphQL-first review-thread provider using `gh api graphql`;
- define normalized review thread and comment data models;
- define triage classifications and structured payload schema;
- document safety policy for replies, resolution, bots, and human decisions;
- split future implementation into read-only triage and mutating fix phases.

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

## Implemented #13 scope

- Add `/flow-watch` command registration.
- Fetch PR-associated checks with `gh pr checks` as the primary source.
- Support required-only mode and all-checks mode.
- Normalize GitHub buckets and states into Codeflow-owned check statuses.
- Summarize passed, failed, pending, skipped, cancelled, timed-out, no-checks,
  and unknown outcomes.
- Support bounded watch polling, timeout handling, and fail-fast behavior.
- Store bounded latest GitHub checks state in session state.
- Add tests for parsing, policy, summaries, client args/errors, command behavior,
  lifecycle transitions, and state updates.

## Non-goals for #13

- Review comment triage loop.
- Reviewer comment replies.
- Resolving review comments.
- Merge automation.
- Auto-approval.
- Branch deletion.
- Rerunning workflows.

## Next intended implementation split for #14

#14 review comments triage loop should be implemented after this design is
reviewed and the issue moves from `status:needs-design` to a ready state.
Implementation should be split into two small PRs.

### PR 14B: read-only `/flow-comments`

- Add command registration and arguments for unresolved-only, all threads,
  author filters, and path filters.
- Query pull request review threads through `gh api graphql`.
- Normalize GitHub review thread and comment data.
- List unresolved review threads by default.
- Classify threads as `valid`, `invalid`, `stale`, `already_fixed`, or
  `needs_human` when the payload/model path supports it.
- Store bounded triage state in session state.
- Add tests for GraphQL argument construction, response parsing, classification
  schema validation, summaries, filters, and state updates.
- Do not reply, resolve, fix code, commit, push, approve, merge, or add runtime
  dependencies.

### PR 14C: mutating `/flow-fix-comments`

- Consume stored triage state.
- Fix `valid` findings only within reviewed scope.
- Run `/flow-check` after fixes.
- Commit through `/flow-commit` after checks pass.
- Reply to addressed threads using `templates/review-reply.md`.
- Resolve only allowed `valid`, `stale`, or `already_fixed` threads after
  verification and policy checks.
- Never auto-resolve `needs_human`.
- Never auto-resolve `invalid` unless project policy explicitly allows it.
- Update state and final reports with review-comment outcomes.
- Add tests for safety gates, checks-before-resolve, reply rendering, GraphQL
  mutation arguments, and blocked human-decision paths.

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
- Unit tests for GitHub check parsing, status normalization, required-only and
  all-checks modes, summaries, timeout and fail-fast behavior, CLI error
  handling, lifecycle transitions, and bounded GitHub checks state.
- Unit tests for future review-thread GraphQL parsing, normalization, triage
  schema validation, filters, state storage, reply rendering, checks-before-
  resolve gates, and human-decision blockers.
- Manual check that unplanned review comment automation, auto-approval, merge
  automation, branch deletion, and workflow reruns remain out of scope.
