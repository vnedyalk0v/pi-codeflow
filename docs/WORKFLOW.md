# Codeflow Workflow

Codeflow defines a named lifecycle for AI-assisted coding work. The lifecycle is
a guidance path first and a safety boundary second: agents should be steered into
valid next steps before unsafe actions become possible.

## Implementation status

The v0.6 foundation exposes lifecycle phase types, initial in-memory lifecycle
state creation, next expected action guidance, before-agent guidance injection,
`/flow-start` semantic branch preparation, `/flow-check` local check running,
and `/flow-commit` template-rendered commit creation.

`/flow-start` moves a clean repository from `initialized` to `branch_prepared`
by validating or inferring the branch type, rendering the branch name, selecting
the configured base branch, and creating or switching to the work branch.
`/flow-check` then runs configured checks in order, captures result metadata,
stores the latest bounded check state in the command result, and summarizes
failures. `/flow-commit` validates structured commit payloads, renders the final
commit message from the configured template, commits staged changes with a
message file, and stores bounded commit metadata. PR rendering, self-review
automation, persistent external state storage, and GitHub automation are later
work.

## Phase reference

| Phase | Purpose | Command or tool |
| --- | --- | --- |
| `idle` | No active Codeflow task. | `/flow-status` |
| `initialized` | Task is accepted and classified. | `/flow-start` |
| `branch_prepared` | Semantic branch is ready. | `/flow-start` |
| `planning` | Implementation plan is produced. | `/flow-plan` |
| `implementing` | Changes are made. | Agent editing tools |
| `local_checks` | Configured checks run. | `/flow-check` |
| `self_review` | Agent reviews its own diff. | `/flow-review` |
| `fixing_local_findings` | Local check or self-review issues are fixed. | Agent editing tools, `/flow-check` |
| `ready_to_commit` | Diff is ready for commit payload generation. | `/flow-commit` |
| `committed` | Local commit exists. | `/flow-pr` |
| `pr_opened` | Pull request exists. | `/flow-pr` |
| `ci_waiting` | Remote checks are running. | `/flow-watch` |
| `review_triage` | Reviewer comments are classified. | `/flow-comments` |
| `fixing_review_findings` | Valid reviewer comments are addressed. | `/flow-fix-comments`, `/flow-check` |
| `verified` | Local and relevant remote verification passed or was intentionally skipped. | `/flow-report` |
| `final_reported` | Work is summarized for the user. | `/flow-report` |
| `blocked` | Agent cannot safely continue. | `/flow-status` |
| `emergency` | Explicit emergency path is active. | `/flow-start`, `/flow-commit`, `/flow-pr`, `/flow-report` |

## After `/flow-start`

After a successful `/flow-start`, Codeflow reports `branch_prepared`. The next
expected actions are to continue only on the prepared work branch and move to
planning with `/flow-plan` when that command exists, or provide a structured plan
if the user asks. `/flow-start` does not run checks, commit, push, open a PR, or
perform implementation.

## After `/flow-check`

After implementation changes, `/flow-check` loads the resolved Codeflow config
and runs only the checks from `config.checks`. It never accepts a freeform
command argument, commits, pushes, opens a PR, watches GitHub checks, or resolves
review comments.

Pass and failure behavior:

- passing required checks record `local_checks` with next action toward
  self-review;
- failed required checks, including timeouts, record `fixing_local_findings` and
  instruct the agent to fix the local output before re-running `/flow-check`;
- optional check failures are reported but do not fail the overall run;
- no configured checks record `local_checks` with a warning and must not be
  presented as verified local evidence;
- dry-runs show the planned checks as skipped and must not be presented as
  executed verification.

## After `/flow-commit`

After checks and self-review are acceptable, `/flow-commit` reads a structured
payload, validates it, renders the final commit message from the configured
commit template, and commits only staged changes. It never stages all files,
pushes, opens a PR, watches GitHub checks, resolves review comments, or merges.

Failure behavior:

- invalid payload blocks with validation errors;
- no staged changes blocks because Codeflow will not auto-stage files;
- reserved branches block unless an explicit emergency override is configured;
- failed latest check state blocks unless `--allow-unverified` or config allows
  unverified commits;
- missing or `no_checks` state warns by default and blocks only when config
  requires passed checks before commit;
- git commit failure blocks with exit code and stderr summary;
- dry-run renders the message and reports warnings without moving to
  `committed`.

## Phase details

### `idle`

- **Purpose:** no active Codeflow task.
- **Entry conditions:** repository is available and no task is active.
- **Expected agent behavior:** wait for a task or issue; do not mutate files.
- **Expected command/tool:** `/flow-status`.
- **Allowed transitions:** `initialized`, `emergency`.
- **Failure transitions:** `blocked`.
- **Output artifacts:** none.

### `initialized`

- **Purpose:** task is accepted and classified.
- **Entry conditions:** user request or issue is provided.
- **Expected agent behavior:** identify task type, refs, constraints, and base
  branch.
- **Expected command/tool:** `/flow-start`.
- **Allowed transitions:** `branch_prepared`, `blocked`, `emergency`.
- **Failure transitions:** `blocked` on invalid config, invalid branch type,
  dirty tree, missing base branch, or unsupported emergency behavior.
- **Output artifacts:** task metadata, branch payload, and lifecycle state result.

### `branch_prepared`

- **Purpose:** semantic branch is ready.
- **Entry conditions:** config is valid, the working tree was clean, the base
  branch exists or configured fallback was available, and `/flow-start` prepared
  the work branch.
- **Expected agent behavior:** work only on the semantic branch.
- **Expected command/tool:** `/flow-start`.
- **Allowed transitions:** `planning`, `blocked`, `emergency`.
- **Failure transitions:** `blocked` on branch collision, missing base, dirty
  tree, or reserved work branch.
- **Output artifacts:** branch name, base branch, task, phase, and next expected
  actions.

### `planning`

- **Purpose:** implementation plan is produced.
- **Entry conditions:** task and branch metadata exist.
- **Expected agent behavior:** create a concise plan with files, checks, risks,
  and rollback notes.
- **Expected command/tool:** `/flow-plan`.
- **Allowed transitions:** `implementing`, `blocked`, `emergency`.
- **Failure transitions:** `blocked` if requirements are unclear.
- **Output artifacts:** implementation plan.

### `implementing`

- **Purpose:** changes are made.
- **Entry conditions:** plan is accepted or the task is docs-only.
- **Expected agent behavior:** make focused changes that match the plan and
  issue.
- **Expected command/tool:** agent editing tools.
- **Allowed transitions:** `local_checks`, `self_review`, `blocked`,
  `emergency`.
- **Failure transitions:** `blocked` on missing information or unsafe request.
- **Output artifacts:** working tree diff.

### `local_checks`

- **Purpose:** configured checks run.
- **Entry conditions:** there is a diff or committed change to verify, or the
  agent needs to record that no checks are configured.
- **Expected agent behavior:** run checks in configured order and capture
  results.
- **Expected command/tool:** `/flow-check`.
- **Allowed transitions:** `self_review`, `fixing_local_findings`, `verified`,
  `blocked`.
- **Failure transitions:** `fixing_local_findings` on required failures or
  timeouts; `blocked` on invalid config.
- **Output artifacts:** check results, failure summaries, and bounded latest
  check state.

### `self_review`

- **Purpose:** agent reviews its own diff.
- **Entry conditions:** diff exists and checks have run or are intentionally
  skipped.
- **Expected agent behavior:** review for task fit, safety, docs, tests, and
  regressions.
- **Expected command/tool:** `/flow-review`.
- **Allowed transitions:** `ready_to_commit`, `fixing_local_findings`,
  `blocked`.
- **Failure transitions:** `fixing_local_findings` on findings.
- **Output artifacts:** self-review report.

### `fixing_local_findings`

- **Purpose:** local check or self-review issues are fixed.
- **Entry conditions:** failed checks or self-review findings exist.
- **Expected agent behavior:** fix only identified local findings; keep scope
  focused.
- **Expected command/tool:** agent editing tools, `/flow-check`.
- **Allowed transitions:** `local_checks`, `self_review`, `blocked`.
- **Failure transitions:** `blocked` when the fix requires human decision.
- **Output artifacts:** updated diff and check results.

### `ready_to_commit`

- **Purpose:** diff is ready for commit payload generation.
- **Entry conditions:** checks and self-review are acceptable.
- **Expected agent behavior:** stage intended changes and provide structured
  commit payload only.
- **Expected command/tool:** `/flow-commit`.
- **Allowed transitions:** `committed`, `blocked`.
- **Failure transitions:** `blocked` on invalid payload, no staged changes,
  reserved branch, failed required check state, or git commit failure.
- **Output artifacts:** commit payload, rendered message, commit SHA on success,
  and bounded commit metadata. Dry-run returns a preview and remains
  `ready_to_commit`.

### `committed`

- **Purpose:** local commit exists.
- **Entry conditions:** Codeflow rendered and performed the commit from staged
  changes.
- **Expected agent behavior:** prepare PR payload; do not rewrite history by
  default.
- **Expected command/tool:** future `/flow-pr`.
- **Allowed transitions:** `pr_opened`, `local_checks`, `blocked`.
- **Failure transitions:** `blocked` if no remote or invalid base when PR support
  is implemented.
- **Output artifacts:** commit SHA and bounded commit metadata.

### `pr_opened`

- **Purpose:** pull request exists.
- **Entry conditions:** PR payload is valid and branch is pushed.
- **Expected agent behavior:** track PR, summarize context, and wait for CI or
  review.
- **Expected command/tool:** `/flow-pr`.
- **Allowed transitions:** `ci_waiting`, `review_triage`, `verified`,
  `blocked`.
- **Failure transitions:** `blocked` if PR creation fails.
- **Output artifacts:** PR URL and rendered body.

### `ci_waiting`

- **Purpose:** remote checks are running.
- **Entry conditions:** PR exists and GitHub checks are available.
- **Expected agent behavior:** watch checks and summarize status.
- **Expected command/tool:** `/flow-watch`.
- **Allowed transitions:** `verified`, `fixing_local_findings`,
  `review_triage`, `blocked`.
- **Failure transitions:** `fixing_local_findings` on CI failure; `blocked` on
  unavailable status.
- **Output artifacts:** CI summary.

### `review_triage`

- **Purpose:** reviewer comments are classified.
- **Entry conditions:** PR has unresolved comments.
- **Expected agent behavior:** classify each comment before acting.
- **Expected command/tool:** `/flow-comments`.
- **Allowed transitions:** `fixing_review_findings`, `verified`, `blocked`.
- **Failure transitions:** `blocked` when a comment needs human decision.
- **Output artifacts:** review triage payload.

### `fixing_review_findings`

- **Purpose:** valid reviewer comments are addressed.
- **Entry conditions:** at least one valid review finding exists.
- **Expected agent behavior:** fix valid comments, re-run checks, and reply with
  evidence.
- **Expected command/tool:** `/flow-fix-comments`, `/flow-check`.
- **Allowed transitions:** `local_checks`, `ci_waiting`, `review_triage`,
  `verified`, `blocked`.
- **Failure transitions:** `blocked` if requested change is unsafe or ambiguous.
- **Output artifacts:** fix commits, replies, and check results.

### `verified`

- **Purpose:** local and relevant remote verification passed or was intentionally
  skipped.
- **Entry conditions:** checks, self-review, CI, and review triage are
  acceptable.
- **Expected agent behavior:** prepare final delivery report.
- **Expected command/tool:** `/flow-report`.
- **Allowed transitions:** `final_reported`, `review_triage`, `blocked`.
- **Failure transitions:** `blocked` if required evidence is missing.
- **Output artifacts:** verification summary.

### `final_reported`

- **Purpose:** work is summarized for the user.
- **Entry conditions:** verification evidence exists.
- **Expected agent behavior:** report changed files, checks, issues, decisions,
  risks, and `finalPhase`.
- **Expected command/tool:** `/flow-report`.
- **Allowed transitions:** `idle`.
- **Failure transitions:** none.
- **Output artifacts:** final report payload and rendered report.

The final report payload must include `finalPhase`. Completed normal work should
usually report `final_reported`; blocked work should report `blocked` and explain
the blocker.

### `blocked`

- **Purpose:** agent cannot safely continue.
- **Entry conditions:** missing information, invalid config, unsafe state, or
  human decision needed.
- **Expected agent behavior:** stop, explain blocker, and ask for guidance.
- **Expected command/tool:** `/flow-status`.
- **Allowed transitions:** prior safe phase, `emergency`, `idle`.
- **Failure transitions:** none.
- **Output artifacts:** blocker report.

### `emergency`

- **Purpose:** explicit emergency path is active.
- **Entry conditions:** user requests urgent handling and provides reason.
- **Expected agent behavior:** prefer a `hotfix/` branch; still use structured
  payloads and final report.
- **Expected command/tool:** `/flow-start`, `/flow-commit`, `/flow-pr`,
  `/flow-report`.
- **Allowed transitions:** `branch_prepared`, `planning`, `verified`,
  `final_reported`, `blocked`.
- **Failure transitions:** `blocked` if reason or authority is missing.
- **Output artifacts:** emergency reason, hotfix branch, and report.

## State transition table

| From | Normal next phases |
| --- | --- |
| `idle` | `initialized`, `emergency` |
| `initialized` | `branch_prepared`, `planning`, `blocked`, `emergency` |
| `branch_prepared` | `planning`, `blocked`, `emergency` |
| `planning` | `implementing`, `blocked`, `emergency` |
| `implementing` | `local_checks`, `self_review`, `blocked`, `emergency` |
| `local_checks` | `self_review`, `fixing_local_findings`, `verified`, `blocked` |
| `self_review` | `ready_to_commit`, `fixing_local_findings`, `blocked` |
| `fixing_local_findings` | `local_checks`, `self_review`, `blocked` |
| `ready_to_commit` | `committed`, `blocked` |
| `committed` | `pr_opened`, `local_checks`, `blocked` |
| `pr_opened` | `ci_waiting`, `review_triage`, `verified`, `blocked` |
| `ci_waiting` | `verified`, `fixing_local_findings`, `review_triage`, `blocked` |
| `review_triage` | `fixing_review_findings`, `verified`, `blocked` |
| `fixing_review_findings` | `local_checks`, `ci_waiting`, `review_triage`, `verified`, `blocked` |
| `verified` | `final_reported`, `review_triage`, `blocked` |
| `final_reported` | `idle` |
| `blocked` | Prior safe phase, `emergency`, `idle` |
| `emergency` | `branch_prepared`, `planning`, `verified`, `final_reported`, `blocked` |

## Retry behavior

### Failed checks

- Move from `local_checks` or `ci_waiting` to `fixing_local_findings`.
- Summarize the failing command, exit status, and relevant output.
- Fix only the failure scope unless the user approves broader work.
- Re-run the failed check and any dependent checks.

### Invalid config

- Move to `blocked`.
- Report the invalid path, expected shape, and suggested fix.
- Do not guess around missing safety or branch policy fields.

### Dirty working tree

- If starting a new task, move to `blocked` unless the dirty state is known to
  belong to the active task.
- Ask whether to continue, stash, commit, or discard. Do not discard changes by
  default.

### Missing `dev` branch

- Move to `blocked` when `dev` is configured as the default base and missing.
- If config allows fallback, use the configured fallback base branch and report
  that choice.
- Do not silently branch from `main` when `dev` was required.

### Review comment is invalid

- Do not change code solely to satisfy the invalid comment.
- Reply with rationale when configured.
- Do not auto-resolve unless policy explicitly allows it.

### Review comment needs human decision

- Move to `blocked`.
- Report the comment, decision needed, and safe options.
- Do not implement speculative product, security, or policy choices.

### Emergency override requested

- Move to `emergency` only when an explicit reason is provided.
- Prefer `hotfix/<ticket-or-slug>` over direct reserved-branch work.
- Require structured commits, structured PRs, checks, and a final report.

## Blocked behavior

When the workflow enters `blocked`, Codeflow should report:

- the phase where the blocker occurred;
- why the agent cannot safely continue;
- what user or maintainer decision is needed;
- whether any working tree changes exist;
- the safest next options.

Blocked state is not a failure of the package. It is the correct outcome when
continuing would require guessing, discarding user work, bypassing policy, or
making a human decision automatically.
