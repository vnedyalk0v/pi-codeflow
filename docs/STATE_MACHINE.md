# Lifecycle State Machine

This document is the compact state-machine reference for Codeflow. See
[WORKFLOW.md](WORKFLOW.md) for detailed phase behavior.

## Implementation status

The v0.4 implementation provides a small lifecycle foundation and the first
command-driven transition:

- `createInitialLifecycleState()` creates an initial state and defaults to
  `idle`.
- `getNextExpectedActions()` returns model-neutral guidance for the active
  phase and resolved config.
- `/flow-start` prepares a semantic branch and returns phase
  `branch_prepared`.
- Persistent state storage and later command-driven transitions are not
  implemented yet.

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

The guidance layer maps phases to next expected actions. `/flow-start` now
performs the `initialized` -> `branch_prepared` branch preparation mutation; the
rest of the action text is proactive guidance, not a mutation engine.

| Phase | Next expected action focus |
| --- | --- |
| `idle` | Wait for a task, then use `/flow-start` when available. |
| `initialized` | Confirm scope and prepare semantic branch metadata. |
| `branch_prepared` | Continue only on the prepared work branch and move to planning. |
| `planning` | Produce an implementation plan before editing. |
| `implementing` | Make focused changes and move toward checks or self-review. |
| `local_checks` | Run configured checks when tooling is available, or record none configured. |
| `self_review` | Review the diff and fix local findings before commit readiness. |
| `fixing_local_findings` | Fix only local check or self-review findings, then re-check. |
| `ready_to_commit` | Provide a structured commit payload for template rendering. |
| `committed` | Prepare a structured PR payload for the configured base branch. |
| `pr_opened` | Track CI and review state before final reporting. |
| `ci_waiting` | Summarize remote check status and react to failures. |
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
| `local_checks` | `self_review` | Checks pass or acceptable skips are recorded. |
| `local_checks` | `fixing_local_findings` | Local checks fail. |
| `self_review` | `ready_to_commit` | Self-review finds no blockers. |
| `self_review` | `fixing_local_findings` | Self-review finds issues. |
| `fixing_local_findings` | `local_checks` | Fixes are ready for re-check. |
| `ready_to_commit` | `committed` | Commit payload validates and commit succeeds. |
| `ready_to_commit` | `blocked` | Payload invalid or staged diff is wrong. |
| `committed` | `pr_opened` | PR payload validates and PR opens/updates. |
| `pr_opened` | `ci_waiting` | GitHub checks are pending. |
| `pr_opened` | `review_triage` | Review comments exist. |
| `pr_opened` | `verified` | No CI or review blockers remain. |
| `ci_waiting` | `verified` | CI passes. |
| `ci_waiting` | `fixing_local_findings` | CI fails. |
| `ci_waiting` | `review_triage` | Review comments arrive while CI is pending. |
| `ci_waiting` | `blocked` | CI status cannot be determined and policy requires it. |
| `review_triage` | `fixing_review_findings` | Valid comments require fixes. |
| `review_triage` | `verified` | Comments are stale, already fixed, or no action needed. |
| `review_triage` | `blocked` | Comment requires human decision. |
| `fixing_review_findings` | `local_checks` | Review fixes need local verification. |
| `fixing_review_findings` | `ci_waiting` | Review fixes pushed and CI is pending. |
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
- review comments require human decision;
- requested work is unsafe or out of scope.

For `/flow-start`, these failures leave the repository unchanged except for any
non-destructive fetch attempt made before base branch resolution.

## Retry transitions

- Failed local checks: `local_checks` -> `fixing_local_findings` ->
  `local_checks`.
- Failed self-review: `self_review` -> `fixing_local_findings` ->
  `self_review`.
- Failed CI: `ci_waiting` -> `fixing_local_findings` -> `local_checks` ->
  `ci_waiting`.
- Invalid payload: `ready_to_commit` or `pr_opened` -> `blocked` -> prior safe
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
