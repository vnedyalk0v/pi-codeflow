# Lifecycle State Machine

This document is the compact state-machine reference for Codeflow. See
[WORKFLOW.md](WORKFLOW.md) for detailed phase behavior.

## Implementation status

The v0.7 implementation provides a small lifecycle foundation and command-driven
transitions through PR check watching:

- `createInitialLifecycleState()` creates an initial state and defaults to
  `idle`.
- `getNextExpectedActions()` returns model-neutral guidance for the active
  phase and resolved config.
- `/flow-start` prepares a semantic branch and returns phase
  `branch_prepared`.
- `/flow-check` runs configured checks, records the latest bounded check state,
  and returns `local_checks` or `fixing_local_findings`.
- `/flow-commit` validates a structured payload, renders a commit message,
  commits staged changes, and returns `committed` on success.
- `/flow-pr` validates a structured PR payload, renders the PR title/body, opens
  or updates a GitHub PR, and returns `pr_opened` on success.
- `/flow-watch` reads GitHub PR checks, stores bounded latest GitHub checks
  state, returns `ci_waiting` for pending, timed-out, or still-empty check
  samples, returns `verified` for passing selected checks, and returns `blocked`
  for skipped-only, failed, cancelled, timed-out, or unknown selected check
  states.
- Persistent external state storage and later review-comment transitions are not
  implemented yet. The #14 design defines the intended review-thread transitions
  before implementation.

## Lifecycle phases

- `idle`
- `initialized`
- `branch_prepared`
- `planning`
- `implementing`
- `local_checks`
- `self_review`
- `fixing_local_findings`
- `ready_to_commit`
- `committed`
- `pr_opened`
- `ci_waiting`
- `review_triage`
- `fixing_review_findings`
- `verified`
- `final_reported`
- `blocked`
- `emergency`

## Next expected action summary

The guidance layer maps phases to next expected actions. `/flow-start` performs
the `initialized` -> `branch_prepared` branch preparation mutation. `/flow-check`
records local check results and returns the phase that should guide the next
step. `/flow-commit` performs the `ready_to_commit` -> `committed` mutation only
when payload validation, staged-change checks, branch safety, check-state policy,
and `git commit` all succeed. `/flow-pr` performs the `committed` ->
`pr_opened` mutation only when PR payload validation, base/head safety,
check-state policy, branch push policy, and GitHub CLI PR creation all succeed.
`/flow-watch` performs the `pr_opened` or `ci_waiting` check-status transition
from read-only GitHub PR checks. Future `/flow-comments` should perform a
read-only transition into `review_triage`; future `/flow-fix-comments` should
return to checks and commits before any reply or resolution. Other action text
remains proactive guidance, not a full mutation engine.

| Phase | Next expected action focus |
| --- | --- |
| `idle` | Wait for a task, then use `/flow-start` when available. |
| `initialized` | Confirm scope and prepare semantic branch metadata. |
| `branch_prepared` | Continue only on the prepared work branch and move to planning. |
| `planning` | Produce an implementation plan before editing. |
| `implementing` | Make focused changes and move toward checks or self-review. |
| `local_checks` | Run configured checks with `/flow-check`, or record none configured with a warning. |
| `self_review` | Review the diff and fix local findings before commit readiness. |
| `fixing_local_findings` | Fix only local check or self-review findings, then re-check. |
| `ready_to_commit` | Provide a structured commit payload and use `/flow-commit`. |
| `committed` | Prepare a structured PR payload and use `/flow-pr`. |
| `pr_opened` | Track CI and review state before final reporting. |
| `ci_waiting` | Use `/flow-watch` to summarize remote check status and react to failures. |
| `review_triage` | Classify comments before acting and stop for human decisions. |
| `fixing_review_findings` | Fix valid review findings and re-run verification. |
| `verified` | Prepare a structured final report payload. |
| `final_reported` | Return to idle unless a new task starts. |
| `blocked` | Stop workflow-changing operations and ask for the needed decision. |
| `emergency` | Confirm emergency reason and still require structured artifacts. |

## Transition table

| From | To | Trigger |
| --- | --- | --- |
| `idle` | `initialized` | User provides task or issue. |
| `idle` | `emergency` | User provides emergency reason. |
| `initialized` | `branch_prepared` | Config valid and branch prepared. |
| `initialized` | `planning` | Docs-only or branch already prepared. |
| `initialized` | `blocked` | Invalid config, invalid branch type, dirty tree, missing base branch, unsupported emergency behavior, or missing required context. |
| `branch_prepared` | `planning` | Semantic branch is active. |
| `planning` | `implementing` | Plan accepted or task is straightforward. |
| `planning` | `blocked` | Requirements unclear. |
| `implementing` | `local_checks` | Changes are ready for verification. |
| `implementing` | `self_review` | Checks intentionally skipped or not configured. |
| `local_checks` | `local_checks` | `/flow-check` passes and records latest local check evidence; next action is self-review. |
| `local_checks` | `local_checks` | `/flow-check` records no configured checks with a warning and does not claim verification. |
| `local_checks` | `fixing_local_findings` | Required local checks fail or time out. |
| `local_checks` | `self_review` | Agent proceeds after acceptable local check evidence or an explicit no-checks note. |
| `self_review` | `ready_to_commit` | Self-review finds no blockers. |
| `self_review` | `fixing_local_findings` | Self-review finds issues. |
| `fixing_local_findings` | `local_checks` | Fixes are ready for re-check. |
| `ready_to_commit` | `committed` | Commit payload validates and commit succeeds. |
| `ready_to_commit` | `blocked` | Payload invalid or staged diff is wrong. |
| `committed` | `pr_opened` | PR payload validates and PR opens/updates. |
| `pr_opened` | `ci_waiting` | `/flow-watch` finds checks pending, no checks yet, or times out before completion. |
| `pr_opened` | `review_triage` | Review comments exist. |
| `pr_opened` | `verified` | `/flow-watch` finds selected checks passed. |
| `pr_opened` | `blocked` | `/flow-watch` finds skipped-only, failed, cancelled, timed-out, or unknown selected checks. |
| `ci_waiting` | `ci_waiting` | `/flow-watch` finds checks still pending, no checks yet, or times out before completion. |
| `ci_waiting` | `verified` | `/flow-watch` finds selected checks passed. |
| `ci_waiting` | `review_triage` | Review comments arrive while CI is pending. |
| `ci_waiting` | `blocked` | `/flow-watch` finds skipped-only, failed, cancelled, timed-out, or unknown selected checks. |
| `review_triage` | `fixing_review_findings` | Valid review threads require fixes. |
| `review_triage` | `verified` | No unresolved threads remain or all threads are verified stale/already fixed. |
| `review_triage` | `final_reported` | No unresolved threads remain and final reporting was the prior expected step. |
| `review_triage` | `blocked` | A thread requires human decision or review-thread state cannot be read safely. |
| `fixing_review_findings` | `local_checks` | Review fixes need local verification. |
| `fixing_review_findings` | `committed` | Verified review fixes are committed through `/flow-commit`. |
| `fixing_review_findings` | `ci_waiting` | Review fixes are pushed and CI is pending. |
| `fixing_review_findings` | `review_triage` | Verification passed and threads need reply or resolution decisions. |
| `verified` | `final_reported` | Final report rendered. |
| `final_reported` | `idle` | Task complete. |
| `blocked` | prior safe phase | User resolves blocker. |
| `blocked` | `idle` | User cancels task. |
| `blocked` | `emergency` | User provides emergency reason. |
| `emergency` | `branch_prepared` | Hotfix branch prepared. |
| `emergency` | `verified` | Emergency verification complete. |
| `emergency` | `final_reported` | Emergency final report rendered. |
| `emergency` | `blocked` | Emergency authority or reason missing. |

## Terminal states

`final_reported` is the normal terminal state for a completed task. The workflow
then returns to `idle`.

The final report payload records the reached phase in `finalPhase`. Completed
normal work should usually use `final_reported`; blocked work should use
`blocked` and include the blocker in the report.

`blocked` may be terminal when the user cancels or does not provide the required
human decision.

## Blocked states

A workflow should enter `blocked` when:

- config is invalid;
- an explicit branch type is not allowed by config;
- a required base branch is missing;
- fallback base branch selection is configured but unavailable;
- the working tree is dirty before task start;
- rendered work branch would be reserved;
- emergency mode is requested but config does not support the hotfix branch
  path;
- branch policy would be violated;
- a payload fails validation;
- `/flow-commit` has no staged changes, is on a reserved branch, has failed
  required check state, or git commit fails;
- `/flow-pr` has an invalid payload, malformed base/head branch name, missing
  remote base branch, reserved head branch, base=head, failed required check
  state, missing GitHub CLI/authentication, unpushed branch when pushing is
  disabled, or GitHub PR creation fails;
- `/flow-watch` finds failed required or selected checks, cancelled checks,
  timed-out checks, unknown GitHub status, missing GitHub CLI/authentication, a
  missing PR, repository access errors, or other unavailable remote status;
- review comments require human decision;
- review-thread state cannot be read or normalized safely;
- a reply or resolution would happen without classification or passing checks;
- requested work is unsafe or out of scope.

For `/flow-start`, these failures leave the repository unchanged except for any
non-destructive fetch attempt made before base branch resolution.

## `/flow-check` transition details

- Passing required checks: `local_checks` -> `local_checks` with latest check
  state recorded and next action toward self-review.
- Failed required checks: `local_checks` -> `fixing_local_findings` with command,
  exit code, duration, and relevant output summarized.
- Timed-out required checks: `local_checks` -> `fixing_local_findings`; use
  `blocked` only when a timeout needs human decision or policy clarification.
- Optional check failures: remain non-blocking but are still captured and shown.
- No checks configured: remain in `local_checks` with a warning and never claim
  `verified`.
- Dry-runs: remain in `local_checks`; skipped planned checks are not verification
  evidence.

## `/flow-commit` transition details

- Successful commit: `ready_to_commit` -> `committed` with commit SHA and
  bounded metadata stored in session state.
- Dry-run: remains `ready_to_commit`; rendered message preview is returned but
  no commit is created.
- Invalid payload: `ready_to_commit` -> `blocked` or remains unchanged when the
  caller keeps state external.
- No staged changes: `ready_to_commit` -> `blocked`; Codeflow does not
  auto-stage files.
- Reserved branch: `ready_to_commit` -> `blocked` unless explicit emergency
  override policy allows it.
- Failed latest check state: `ready_to_commit` -> `blocked` unless unverified
  commit policy or `--allow-unverified` allows a warned commit.
- Missing or `no_checks` state: warns by default and blocks only when config
  requires passed checks before commit.
- Git commit failure: `ready_to_commit` -> `blocked` with git exit code and
  stderr summary.

## `/flow-pr` transition details

- Successful PR creation or update: `committed` -> `pr_opened` with bounded PR
  metadata stored in session state.
- Dry-run: remains `committed`; rendered title/body preview is returned but no
  push or GitHub PR call is performed.
- Invalid payload: `committed` -> `blocked` or remains unchanged when the caller
  keeps state external.
- Reserved head branch: `committed` -> `blocked` unless explicit emergency
  override policy allows it.
- Missing remote base branch or base=head: `committed` -> `blocked`.
- Failed latest check state: `committed` -> `blocked` unless unverified PR policy
  or `--allow-unverified` allows a warned PR.
- Missing or `no_checks` state: warns by default and blocks only when config
  requires passed checks before PR.
- GitHub CLI/auth failure: `committed` -> `blocked` with a clear error.

## `/flow-watch` transition details

- Passing selected checks: `pr_opened` or `ci_waiting` -> `verified` with
  bounded GitHub checks state stored in session state.
- Pending selected checks: `pr_opened` or `ci_waiting` -> `ci_waiting`.
- Transient empty check samples in watch mode: keep polling until checks appear
  or the watch timeout is reached.
- Terminal no-selected-required-checks responses from GitHub CLI: return
  `no_checks` without waiting for the full watch timeout.
- Timeout while selected checks are pending: remain in `ci_waiting`; the result
  status stays `pending` and the summary says the watch timed out.
- Failed selected checks: `pr_opened` or `ci_waiting` -> `blocked` with check
  names, statuses, durations, and redacted details links when available.
- Cancelled or timed-out selected check rows: `pr_opened` or `ci_waiting` ->
  `blocked` because they do not prove remote verification.
- Skipped-only selected checks: `pr_opened` or `ci_waiting` -> `blocked` until
  the skipped status is explicitly accepted.
- No checks found after timeout, terminal no-selected-required-checks responses,
  or single-sample mode: remain in `ci_waiting` with `no_checks`; never claim
  `verified`.
- Unknown GitHub status, even when mixed with pending checks: `pr_opened` or
  `ci_waiting` -> `blocked` with a warning that Codeflow could not normalize the
  returned state.
- Dry-run: does not call GitHub and does not transition to `verified`.

## Future `/flow-comments` transition details

- Read-only thread listing: `pr_opened`, `ci_waiting`, or `verified` ->
  `review_triage` when unresolved review threads exist.
- No unresolved threads: remain `verified` or move to `final_reported` when all
  prior verification evidence is complete.
- Valid threads: `review_triage` -> `fixing_review_findings`.
- Stale or already fixed threads: remain in `review_triage` until evidence is
  recorded; then move to `verified` when no fixes are needed.
- Invalid threads: remain in `review_triage` for a concise explanation, or move
  to `blocked` when policy requires human review.
- `needs_human` threads: move to `blocked` or remain in `review_triage` with a
  human decision request.
- Dry-run or read-only runs never reply, resolve, edit files, commit, push, or
  merge.

## Future `/flow-fix-comments` transition details

- Uses stored triage state and acts only on explicit classifications.
- Valid fixes: `fixing_review_findings` -> `local_checks` after edits.
- Passing checks: `local_checks` -> `ready_to_commit` or `committed` through
  `/flow-commit` when the fix is staged and payload validation succeeds.
- Pushed fix commits: `committed` -> `ci_waiting` through the PR flow and
  `/flow-watch`.
- Replies and resolutions: occur only after verification and return to
  `review_triage` or `verified` based on remaining threads.
- `needs_human` is never auto-resolved.
- `invalid` is never auto-resolved unless policy explicitly allows it.

## Retry transitions

- Failed local checks: `local_checks` -> `fixing_local_findings` ->
  `local_checks`.
- Failed self-review: `self_review` -> `fixing_local_findings` ->
  `self_review`.
- Failed CI: `ci_waiting` -> `blocked`; after fixing, run local checks, commit
  and push the fix, then return to `ci_waiting` with `/flow-watch`.
- Invalid payload: `ready_to_commit` or `committed` -> `blocked` -> prior safe
  phase after correction.

## Emergency transitions

Emergency flow may be entered from `idle`, `initialized`, `branch_prepared`,
`planning`, `implementing`, or `blocked` when the user gives an explicit reason.
It should prefer a `hotfix/` branch and must still produce structured commits,
structured PRs, verification, and final report artifacts.

## Examples

### Normal feature flow

```text
idle
-> initialized
-> branch_prepared
-> planning
-> implementing
-> local_checks
-> self_review
-> ready_to_commit
-> committed
-> pr_opened
-> ci_waiting
-> verified
-> final_reported
-> idle
```

### Failed local check flow

```text
implementing
-> local_checks
-> fixing_local_findings
-> local_checks
-> self_review
-> ready_to_commit
```

### Invalid review comment flow

```text
pr_opened
-> review_triage
-> verified
```

The comment is classified as `invalid`. Codeflow replies with rationale if
configured, does not change code solely for the invalid comment, and does not
resolve it unless policy allows.

### Emergency hotfix flow

```text
idle
-> emergency
-> branch_prepared
-> planning
-> implementing
-> local_checks
-> ready_to_commit
-> committed
-> pr_opened
-> verified
-> final_reported
```

The final report includes the emergency reason and follow-up backport or
cherry-pick plan for `dev`.
