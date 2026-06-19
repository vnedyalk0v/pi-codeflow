# Plan 005: Implement `/flow-watch` read-only GitHub checks watcher

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report; do
> not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 60021a8..HEAD -- docs/decisions/0002-flow-watch-contract.md src/github src/checks src/commands src/extension.ts src/state src/index.ts tests docs schemas`
> If the ADR or any in-scope implementation area changed since this plan was
> written, compare the contract below against the live code before proceeding.
> Stop if `/flow-watch` already exists or if the live ADR contradicts this plan.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: ADR 0002 (`docs/decisions/0002-flow-watch-contract.md`)
- **Category**: feature (read-only GitHub checks watcher)
- **Planned at**: commit `60021a8`, 2026-06-19

## Why this matters

`/flow-pr` can open a pull request and store bounded PR metadata, but the
lifecycle still lacks the implemented step that observes remote checks and moves
`ci_waiting` to `verified`, `fixing_local_findings`, or `blocked`.

ADR 0002 fixes the contract: `/flow-watch` is read-only, uses only `gh pr
checks` and `gh pr view`, treats all returned checks as required for v1, defaults
to a single sample, and allows only bounded polling with `--watch --timeout`.
This plan turns that contract into production code without adding review-comment
triage, merge, approval, or check-rerun behavior.

## Current state

- `src/github/gh-client.ts` already provides `GhClientLike.run(args)` and typed
  `GithubCliError` codes for `gh_missing`, `gh_auth_required`, and command
  failure.
- `src/state/pr-state.ts` stores `pullRequests.lastPullRequest.number`, which is
  the default PR number source for `/flow-watch`.
- `src/lifecycle/lifecycle-phase.ts` already includes `ci_waiting`, `verified`,
  `fixing_local_findings`, and `blocked`.
- `src/extension.ts` registers the existing command trio pattern for
  `/flow-start`, `/flow-check`, `/flow-commit`, and `/flow-pr`.
- `src/checks/check-summary.ts` exports `truncateForSummary`, which must be used
  before surfaced CI output or diagnostics are rendered.

## Contract to implement from ADR 0002

- Normalized status enum: `running`, `passed`, `failed`, `unavailable`.
- `gh pr checks` bucket mapping:
  - `pass` and `skipping` -> `passed`;
  - `pending` -> `running`;
  - `fail` -> `failed`;
  - `cancel`, unknown, or missing -> `unavailable`.
- `ci_waiting` transition rules:
  - missing PR number, missing `gh`, auth required, no checks, or unknown status
    -> `blocked`;
  - any returned failed check -> `fixing_local_findings`;
  - any returned unavailable check -> `blocked`;
  - any running check -> stay `ci_waiting`;
  - at least one check and all passed -> `verified`.
- All returned checks are required for v1; every normalized check carries
  `required: true`.
- Arguments: `--pr <number>`, `--once`, `--watch`, `--timeout <ms>` only.
- Default mode: single sample. `--watch` repeats samples only until terminal
  status or timeout.
- Allowed GitHub CLI subcommands: `pr checks` and `pr view` only.
- Forbidden behavior: merge, approve, review, comment, ready-for-review, edit or
  close PRs, rerun checks, dispatch workflows, mutating `gh api`, branch edits,
  or branch deletion.
- Any surfaced CI output or diagnostic text goes through `truncateForSummary`.

## Scope

**In scope** (the only production files to modify or create):

- `src/checks/check-status.ts` (create normalized status types, row mapping, and
  aggregate/transition helpers)
- `src/github/checks-client.ts` (create read-only GitHub checks client using the
  existing `GhClientLike` seam)
- `src/state/ci-state.ts` (create bounded latest CI watch state)
- `src/state/session-state.ts` (add CI state and an update helper for
  `/flow-watch` lifecycle transitions)
- `src/commands/flow-watch.ts` (create `parseFlowWatchArguments`,
  `runFlowWatch`, and `formatFlowWatchResult`)
- `src/extension.ts` (register `flow-watch` and thread the in-memory session
  store through it)
- `src/index.ts` (export the new command, status types, and checks client types)

**In scope tests**:

- `tests/checks/check-status.test.ts`
- `tests/github/checks-client.test.ts`
- `tests/state/ci-state.test.ts`
- `tests/commands/flow-watch.test.ts`
- `tests/extension/guidance-injection.test.ts` or a new extension command test if
  registration coverage belongs in a separate file

**In scope docs and schema audit**:

- `README.md` (mark `/flow-watch` as implemented if the command table needs a
  status distinction)
- `docs/WORKFLOW.md` (confirm the implemented transition text matches ADR 0002)
- `docs/ARCHITECTURE.md` (move GitHub checks watching from future work to the
  implemented command layer)
- `docs/SECURITY_MODEL.md` (add the `/flow-watch` read-only boundary)
- `docs/IMPLEMENTATION_PLAN.md` (record issue #13 as implemented or update the
  next-intended issue)
- `schemas/` audit: do not add a new schema unless the repository already has a
  command-argument schema that must list `/flow-watch`. There is no structured
  `/flow-watch` payload in ADR 0002.

**Out of scope**:

- Review-comment triage, merge, approval, auto-rerun, workflow dispatch, branch
  mutation, or comment resolution.
- Adding config flags for watch defaults or timeouts.
- Changing `/flow-pr` or `/flow-commit` to watch CI.
- Using `gh pr checks --watch` as an unbounded delegated wait.
- Treating optional checks differently from required checks in v1.

## Git workflow

- Branch: `feat/flow-watch-checks-watcher` (semantic feature branch from `dev`).
- Conventional Commits, for example:
  `feat(commands): add read-only flow-watch checks watcher`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Implement the normalized status helpers

Create `src/checks/check-status.ts` with exported types and pure helpers:

- `CodeflowRemoteCheckStatus = 'running' | 'passed' | 'failed' | 'unavailable'`
- `FlowWatchCheckStatus` with `name`, `workflow`, `state`, `bucket`, `link`,
  `status`, and `required: true`
- `mapGhCheckBucketToStatus(bucket: string | null | undefined)` implementing the
  ADR mapping
- `aggregateFlowWatchStatus(checks)` implementing failed > unavailable > running
  > passed, with an empty list returning `unavailable`
- `getFlowWatchLifecyclePhase(status, checksPresent)` implementing the ADR
  transition rules

Include table-driven unit tests for every bucket value from ADR 0002, unknown
buckets, empty check lists, and aggregate precedence.

**Verify**: `npm run typecheck` -> exit 0.

### Step 2: Implement the read-only GitHub checks client

Create `src/github/checks-client.ts`. It must:

- accept an injectable `GhClientLike` and `cwd`;
- call only `gh pr checks <number> --json name,state,bucket,link,workflow`;
- call only `gh pr view <number> --json statusCheckRollup,mergeStateStatus` for
  fallback diagnostics and merge-state metadata;
- parse JSON defensively and normalize rows through `src/checks/check-status.ts`;
- convert `GithubCliError` codes `gh_missing` and `gh_auth_required` into an
  `unavailable` result with warnings instead of an unhandled throw;
- convert no-checks output from `gh pr checks` into `unavailable` with a warning;
- leave other `gh_command_failed` cases as blocked/unavailable with a warning
  unless the error means invalid arguments in Codeflow itself;
- pass surfaced stderr/stdout diagnostics through `truncateForSummary`.

Tests should use a fake `GhClientLike` and assert the exact argument arrays. Add
negative tests proving no mutating subcommand is used.

**Verify**: `npx vitest run tests/github/checks-client.test.ts tests/checks/check-status.test.ts`
-> all pass.

### Step 3: Add bounded CI watch state

Create `src/state/ci-state.ts` with a bounded `lastWatch` record containing the
PR number, aggregate status, normalized checks, sampled timestamp,
`mergeStateStatus`, and final lifecycle phase. Update `src/state/session-state.ts`
to initialize this state and expose `updateSessionStateWithCiWatch`.

Keep stored check rows bounded to metadata from ADR 0002. Do not store raw logs.

**Verify**: `npx vitest run tests/state/ci-state.test.ts` -> all pass.

### Step 4: Implement `/flow-watch`

Create `src/commands/flow-watch.ts` following the existing command trio pattern.

`parseFlowWatchArguments(args)` must:

- accept `--pr <number>`, `--once`, `--watch`, and `--timeout <ms>`;
- reject unknown flags;
- reject non-positive or non-integer PR and timeout values;
- reject incompatible sampling flags if both `--once` and `--watch` are present.

`runFlowWatch(options)` must:

- resolve the PR number from `options.prNumber` first, then
  `options.sessionState?.pullRequests.lastPullRequest?.number`;
- return a blocked/unavailable result with a next action when no PR number is
  available;
- default to one sample;
- when `watch` is true, repeat read-only samples until `passed`, `failed`,
  `unavailable`, or timeout;
- never block indefinitely;
- update session state through `updateSessionStateWithCiWatch`;
- return `status`, normalized checks, `lifecyclePhase`, `nextExpectedActions`,
  `warnings`, and `sessionState` exactly as ADR 0002 defines.

`formatFlowWatchResult(result)` must summarize the PR number, aggregate status,
check rows, lifecycle phase, warnings, and next actions. Any diagnostic output
must already be redacted/truncated.

Tests should model `tests/commands/flow-pr.test.ts` with injected fakes and
cover passed, failed, running, unavailable, auth required, missing PR number,
explicit `--pr`, session-state PR number, timeout, and formatter output.

**Verify**: `npx vitest run tests/commands/flow-watch.test.ts` -> all pass.

### Step 5: Register and export the command

Update `src/extension.ts` to register `flow-watch`, call
`parseFlowWatchArguments`, pass the current session state, store the returned
state, and notify with `formatFlowWatchResult`. Update `src/index.ts` exports.

Add extension registration coverage with an injected `runFlowWatch` fake. Confirm
existing command registration still passes its tests.

**Verify**: `npx vitest run tests/extension/guidance-injection.test.ts tests/commands/flow-watch.test.ts`
-> all pass.

### Step 6: Update docs and audit schemas

Update docs listed in scope so they describe `/flow-watch` as implemented,
read-only, and limited to the ADR command contract. Keep `/flow-pr` and
`/flow-commit` documented as not watching CI.

Audit `schemas/`. If no command-argument schema exists, record in the docs or PR
notes that no schema update was required because `/flow-watch` has no structured
payload and no new config. Do not invent a config schema for timeouts.

**Verify**: `node scripts/check-docs-format.mjs` -> exit 0.

### Step 7: Full verification

Run the full suite and safety greps:

```sh
npm run check
if grep -R "pr merge\|pr review\|pr ready\|pr comment\|run rerun\|workflow run" src/github/checks-client.ts src/commands/flow-watch.ts; then exit 1; else exit 0; fi
```

Both commands must exit 0.

## Test plan

- `tests/checks/check-status.test.ts`: bucket mapping, fallback mapping,
  aggregate precedence, empty-list unavailable behavior, and lifecycle mapping.
- `tests/github/checks-client.test.ts`: fake `GhClientLike` JSON parsing,
  argument arrays, no-checks handling, `gh_missing`, `gh_auth_required`, unknown
  bucket warnings, merge-state metadata, and redaction of diagnostics.
- `tests/state/ci-state.test.ts`: initial CI state and bounded last-watch update.
- `tests/commands/flow-watch.test.ts`: argument parser, PR-number resolution,
  one-sample default, bounded watch timeout, transition outcomes,
  nextExpectedActions, warnings, formatter, and injected fake client behavior.
- Extension tests: command registration stores returned session state and
  surfaces formatted output without registering mutating commands.
- Verification: `npm run check` and the forbidden-subcommand grep both exit 0.

## Done criteria

ALL must hold:

- [ ] `/flow-watch` is registered in `src/extension.ts` and exported from
      `src/index.ts`.
- [ ] `parseFlowWatchArguments`, `runFlowWatch`, and `formatFlowWatchResult`
      exist in `src/commands/flow-watch.ts` and implement only the ADR 0002
      flags.
- [ ] `src/github/checks-client.ts` calls only `gh pr checks` and `gh pr view`.
- [ ] Status mapping matches ADR 0002, including `skipping` -> `passed` and
      `cancel` -> `unavailable`.
- [ ] All returned checks are treated as `required: true` for v1.
- [ ] Missing PR number, `gh_missing`, `gh_auth_required`, no checks, canceled
      checks, and unknown status shapes produce `blocked` with clear next
      actions instead of false verification.
- [ ] Failed checks transition to `fixing_local_findings`; running checks remain
      in `ci_waiting`; all passed checks transition to `verified`.
- [ ] `--watch` polling is bounded by timeout and has deterministic tests using
      injected sleep or clock helpers.
- [ ] Any surfaced CI output or diagnostics pass through `truncateForSummary`.
- [ ] No review, merge, comment, rerun, workflow-dispatch, branch-mutation, or
      mutating `gh api` behavior is added.
- [ ] Docs describe the implemented read-only boundary and no new config schema
      is introduced for watch defaults.
- [ ] `npm run check` exits 0.
- [ ] The forbidden-subcommand grep in Step 7 exits 0.

## STOP conditions

Stop and report back without improvising if:

- `/flow-watch` already exists in live code during the drift check.
- ADR 0002 has changed and contradicts this plan's status mapping, argument
  contract, or read-only boundary.
- Implementing the command appears to require a GitHub CLI subcommand outside
  `pr checks` or `pr view`.
- Required vs. optional check handling cannot follow the ADR rule that all v1
  returned checks are required.
- Bounded polling cannot be implemented without an indefinite wait.
- A schema or config change appears necessary even though ADR 0002 defines no
  structured payload or new config.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- This plan intentionally ships only remote check observation and lifecycle
  updates. Review-comment triage remains a separate command and issue.
- If a future GitHub API exposes clear per-check requirement metadata, write a
  new ADR or plan before changing v1's all-required rule.
- Keep the GitHub CLI boundary easy to review: all `gh` calls for this command
  should live behind `src/github/checks-client.ts`.
