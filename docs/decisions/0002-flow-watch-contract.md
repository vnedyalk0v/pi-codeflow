# ADR 0002: Define `/flow-watch` as a read-only GitHub checks watcher

## Status

Accepted; updated by #13 implementation.

## Context

`/flow-watch` is named in the README command surface and maps to the existing
`ci_waiting` lifecycle phase. The command is the bridge between a PR opened by `/flow-pr` and a verified,
ci-waiting, or blocked result. The #13 implementation now ships the read-only
watcher foundation.

The security model keeps `/flow-pr` and `/flow-commit` away from CI watching,
review actions, and merge actions. `/flow-watch` is the only planned command
that may observe remote checks, and it must stay read-only.

A spike in `spike/flow-watch/` checked GitHub CLI version 2.95.0. The installed
`gh pr checks --help` documents JSON fields `bucket`, `completedAt`,
`description`, `event`, `link`, `name`, `startedAt`, `state`, and `workflow`.
It also documents the full `bucket` set as `pass`, `fail`, `pending`,
`skipping`, and `cancel`, plus exit code `8` for pending checks. Real samples
observed `state` values `SUCCESS` and `SKIPPED`, plus `bucket` values `pass` and
`skipping`. `gh pr view --json statusCheckRollup,mergeStateStatus` returned a
heterogeneous `statusCheckRollup` array of check-run objects and a
`mergeStateStatus` string. The GitHub CLI source confirms the rollup can include
classic `StatusContext` rows with `context`, `state`, and `targetUrl` fields.

## Decision

### Implementation update from #13

The shipped #13 implementation uses the Codeflow-owned check status enum
`passed`, `failed`, `pending`, `skipped`, `cancelled`, `timed_out`, `neutral`,
and `unknown`, with aggregate statuses `passed`, `failed`, `pending`, `skipped`,
`no_checks`, and `unknown`. `gh pr checks` remains the primary source, and
`--required` is used for required-only mode. No checks never claim verification.
Failed, cancelled, timed-out, or unknown selected checks block the workflow;
pending timeout keeps `ci_waiting`.

The original v1 design notes below are retained as historical rationale, but the
implemented API and docs in #13 are the current contract.

### Normalized status model

`/flow-watch` will normalize GitHub check status to this Codeflow enum:

- `running`: at least one relevant check is still pending or in progress;
- `passed`: a relevant check reached a terminal non-failing state;
- `failed`: a relevant check reached a terminal failing state;
- `unavailable`: Codeflow cannot obtain an authoritative check status.

Primary mapping comes from `gh pr checks <number> --json
name,state,bucket,link,workflow`. `bucket` is authoritative when present because
this installed `gh` version documents it as the stable categorization of
`state`.

`gh pr checks` exit code `8` means checks are pending. `GhClient.run` wraps
non-zero exits as `GithubCliError`, so the implementation must inspect
`exitCode` and `stdout`: when `exitCode` is `8` and `stdout` contains parseable
check rows, normalize those rows normally instead of treating the command as
`unavailable`. If exit `8` has no parseable rows, fall back to `gh pr view` or
return `unavailable` with a warning.

| `gh pr checks` bucket | Observed or documented `state` examples | Codeflow status | Notes |
| --- | --- | --- | --- |
| `pass` | observed `SUCCESS` | `passed` | Terminal success. |
| `skipping` | observed `SKIPPED` | `passed` | Terminal non-failing GitHub result; do not block solely because a job was skipped. |
| `pending` | documented bucket | `running` | Check has not reached a terminal result. |
| `fail` | documented bucket | `failed` | Terminal failing result that requires local investigation. |
| `cancel` | documented bucket | `unavailable` | Canceled checks do not prove pass or local failure; block for explicit operator action. |
| unknown or missing bucket | any unrecognized `state` | `unavailable` | Unknown values are conservative and produce a warning. |

`gh pr view <number> --json statusCheckRollup,mergeStateStatus` may be used as a
read-only fallback or diagnostic source when `pr checks` cannot provide rows.
The fallback mapping is conservative and must handle both `CheckRun` and classic
`StatusContext` rows:

| `statusCheckRollup` row shape | Fields | Codeflow status |
| --- | --- | --- |
| `CheckRun` | `status` is `QUEUED`, `REQUESTED`, `WAITING`, `PENDING`, or `IN_PROGRESS` | `running` |
| `CheckRun` | `status` is `COMPLETED` and `conclusion` is `SUCCESS`, `NEUTRAL`, or `SKIPPED` | `passed` |
| `CheckRun` | `status` is `COMPLETED` and `conclusion` is `FAILURE`, `TIMED_OUT`, `ACTION_REQUIRED`, or `STARTUP_FAILURE` | `failed` |
| `CheckRun` | `status` is `COMPLETED` and `conclusion` is `CANCELLED` | `unavailable` |
| `StatusContext` | `state` is `PENDING` or `EXPECTED` | `running` |
| `StatusContext` | `state` is `SUCCESS` | `passed` |
| `StatusContext` | `state` is `FAILURE` or `ERROR` | `failed` |
| Any row | Empty rollup, missing discriminator, missing fields, or unknown values | `unavailable` |

### `ci_waiting` transition rules

The command updates the session lifecycle from the sampled status as follows:

1. If no PR number is available, `gh` is missing, `gh` authentication is needed,
   the PR has no check status, or GitHub returns an unknown status shape, set
   `lifecyclePhase` to `blocked`.
2. If any returned check normalizes to `failed`, set `lifecyclePhase` to
   `fixing_local_findings`.
3. If any returned check normalizes to `unavailable`, set `lifecyclePhase` to
   `blocked`.
4. If any returned check normalizes to `running`, keep `lifecyclePhase` at
   `ci_waiting`.
5. If at least one check is present and all returned checks normalize to
   `passed`, set `lifecyclePhase` to `verified`.

For v1, all checks returned by `gh pr checks` are treated as required. The
installed `gh` supports a `--required` filter, but the all-checks JSON rows do
not include a per-row `required` field. Treating all returned checks as required
is conservative, avoids silently ignoring optional-looking failures, and can be
revisited if a later GitHub API contract exposes requirement metadata clearly.

### Command contract

The future implementation must follow the existing command trio pattern:

- `parseFlowWatchArguments(args)` parses command flags;
- `runFlowWatch(options)` performs the read-only sampling or bounded polling;
- `formatFlowWatchResult(result)` renders the status summary and next actions.

`parseFlowWatchArguments` accepts only these flags:

- `--pr <number>`: positive integer PR number. When present, it overrides the
  session state's `lastPullRequest.number` for cross-session use.
- `--once`: explicit single-sample mode. This is also the default.
- `--watch`: opt into bounded polling by repeating the read-only sample until a
  terminal status or timeout.
- `--timeout <ms>`: positive integer timeout for `--watch`. It must not create
  an indefinite wait. A default timeout is acceptable for `--watch`, but the
  implementation plan must test that polling stops at the bound.

No argument may trigger merge, approval, review submission, comment posting,
branch mutation, check rerun, workflow dispatch, or deletion.

`runFlowWatch(options)` inputs are:

- `cwd?: string` for the repository working directory;
- `prNumber?: number` from `--pr`;
- `once?: boolean` and `watch?: boolean` for sampling mode;
- `timeoutMs?: number` for bounded watch mode;
- `ghClient?: GhClientLike` so tests can inject fake GitHub CLI results;
- `sessionState?: CodeflowSessionState`, using
  `sessionState.pullRequests.lastPullRequest.number` when `prNumber` is absent;
- optional clock or sleep injection if the implementation needs deterministic
  polling tests.

`runFlowWatch(options)` returns:

- `prNumber: number | null` for the PR that was sampled, or `null` when missing;
- `status: 'running' | 'passed' | 'failed' | 'unavailable'` for the aggregate;
- `checks: FlowWatchCheckStatus[]`, where each item includes `name`,
  `workflow`, `state`, `bucket`, `link`, `status`, and `required: true` for v1;
- `mergeStateStatus?: string` when `gh pr view` provides it;
- `lifecyclePhase: CodeflowLifecyclePhase` using the transition rules above;
- `nextExpectedActions: string[]` with a run-again, fix, auth, or blocked action;
- `warnings: string[]` for missing auth, unknown status, no checks, timeout, or
  fallback parsing;
- `sessionState: CodeflowSessionState` with the lifecycle phase updated.

The result may include `sampledAt` and `timedOut` fields if useful for the
bounded-poll renderer. It must not include raw CI logs unless they have passed
through the redaction rule below.

### Read-only GitHub CLI boundary

`/flow-watch` may call only these GitHub CLI subcommands:

- `gh pr checks <number> --json name,state,bucket,link,workflow`
- `gh pr view <number> --json statusCheckRollup,mergeStateStatus`

The command's `--watch` flag is not permission to use an unbounded GitHub CLI
watch. Bounded polling should repeat the allowed read-only sample commands under
Codeflow's own timeout.

`/flow-watch` must never call these GitHub CLI subcommands or equivalents:

- `gh pr merge`, `gh pr review`, `gh pr ready`, `gh pr comment`, `gh pr close`,
  `gh pr edit`, or `gh pr reopen`;
- `gh run rerun`, `gh workflow run`, or other commands that start or rerun CI;
- mutating `gh api` calls;
- any command that approves, merges, requests review, resolves comments, edits
  branches, deletes branches, or bypasses branch protection.

Review-comment triage, merge, approval, auto-rerun, and comment resolution are
explicitly out of scope for v1 and require separate issues and security review.

### Redaction rule

Any CI output, description, or diagnostic text surfaced to the user or agent
must pass through `truncateForSummary` from `src/checks/check-summary.ts`. That
helper strips ANSI and calls `redactSecrets`. The v1 `pr checks` row fields are
small metadata fields, but the rule applies before any future log or annotation
text is rendered.

### Open-question decisions

- **Q1 required vs. optional checks:** v1 treats all returned checks as required.
  Rationale: `gh pr checks --required` can filter rows, but the all-checks JSON
  shape has no per-row `required` field, so precise classification is not
  available from the captured contract.
- **Q2 PR number source:** support both session state and explicit `--pr
  <number>`. Rationale: session state is the normal `/flow-pr` handoff, while
  explicit `--pr` makes fresh agent sessions usable.
- **Q3 poll vs. single sample:** default to a single sample; add `--watch` with
  `--timeout <ms>` for bounded polling. Rationale: single samples fit agent turn
  limits, and polling must never block indefinitely.
- **Q4 authentication failure:** map `gh_auth_required` to `unavailable` and
  `blocked`, not to an unhandled hard throw. Rationale: the agent needs a clear
  next action to authenticate or ask the operator.

## Consequences

- The implementation can be built without changing the security boundary: it is
  read-only and limited to `pr checks` and `pr view`.
- v1 may be stricter than GitHub branch protection because all returned checks
  count as required. This is intentional until requirement metadata is explicit.
- Canceled or unknown states block instead of being treated as failures or
  passes. This prevents false verification and avoids implying a local fix when
  CI did not complete.
- The retained spike under `spike/flow-watch/` is reference material only and
  must not be imported by `src/` or `extensions/`.
