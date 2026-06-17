# Codeflow Workflow

Codeflow defines a named lifecycle for AI-assisted coding work. The lifecycle is
a guidance path first and a safety boundary second: agents should be steered into
valid next steps before unsafe actions become possible.

## Lifecycle phases

| Phase | Purpose | Entry conditions | Expected agent behavior | Expected command/tool | Allowed transitions | Failure transitions | Output artifacts |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `idle` | No active Codeflow task. | Repository is available and no task is active. | Wait for a task or issue; do not mutate files. | `/flow-status` | `initialized`, `emergency` | `blocked` | None. |
| `initialized` | Task is accepted and classified. | User request or issue is provided. | Identify task type, refs, constraints, and base branch. | `/flow-start` | `branch_prepared`, `planning`, `blocked`, `emergency` | `blocked` on invalid config or dirty tree. | Task metadata and branch payload. |
| `branch_prepared` | Semantic branch is ready. | Config is valid and base branch exists. | Work only on the semantic branch. | `/flow-start` | `planning`, `blocked`, `emergency` | `blocked` on branch collision or missing base. | Branch name and base branch. |
| `planning` | Implementation plan is produced. | Task and branch metadata exist. | Create a concise plan with files, checks, risks, and rollback notes. | `/flow-plan` | `implementing`, `blocked`, `emergency` | `blocked` if requirements are unclear. | Implementation plan. |
| `implementing` | Changes are made. | Plan is accepted or the task is docs-only. | Make focused changes that match the plan and issue. | Agent editing tools. | `local_checks`, `self_review`, `blocked`, `emergency` | `blocked` on missing information or unsafe request. | Working tree diff. |
| `local_checks` | Configured checks run. | There is a diff or committed change to verify. | Run checks in configured order and capture results. | `/flow-check` | `self_review`, `fixing_local_findings`, `verified`, `blocked` | `fixing_local_findings` on failures; `blocked` on invalid config. | Check results. |
| `self_review` | Agent reviews its own diff. | Diff exists and checks have run or are intentionally skipped. | Review for task fit, safety, docs, tests, and regressions. | `/flow-review` | `ready_to_commit`, `fixing_local_findings`, `blocked` | `fixing_local_findings` on findings. | Self-review report. |
| `fixing_local_findings` | Local check or self-review issues are fixed. | Failed checks or self-review findings exist. | Fix only identified local findings; keep scope focused. | Agent editing tools, `/flow-check` | `local_checks`, `self_review`, `blocked` | `blocked` when fix requires human decision. | Updated diff and check results. |
| `ready_to_commit` | Diff is ready for commit payload generation. | Checks and self-review are acceptable. | Stage intended changes and provide structured commit payload only. | `/flow-commit` | `committed`, `blocked` | `blocked` on dirty unstaged required changes or invalid payload. | Commit payload and rendered message. |
| `committed` | Local commit exists. | Codeflow rendered and performed the commit. | Prepare PR payload; do not rewrite history by default. | `/flow-pr` | `pr_opened`, `local_checks`, `blocked` | `blocked` if no remote or invalid base. | Commit SHA. |
| `pr_opened` | Pull request exists. | PR payload is valid and branch is pushed. | Track PR, summarize context, and wait for CI/review. | `/flow-pr` | `ci_waiting`, `review_triage`, `verified`, `blocked` | `blocked` if PR creation fails. | PR URL and rendered body. |
| `ci_waiting` | Remote checks are running. | PR exists and GitHub checks are available. | Watch checks and summarize status. | `/flow-watch` | `verified`, `fixing_local_findings`, `review_triage`, `blocked` | `fixing_local_findings` on CI failure; `blocked` on unavailable status. | CI summary. |
| `review_triage` | Reviewer comments are classified. | PR has unresolved comments. | Classify each comment before acting. | `/flow-comments` | `fixing_review_findings`, `verified`, `blocked` | `blocked` when comment needs human decision. | Review triage payload. |
| `fixing_review_findings` | Valid reviewer comments are addressed. | At least one valid review finding exists. | Fix valid comments, re-run checks, reply with evidence. | `/flow-fix-comments`, `/flow-check` | `local_checks`, `ci_waiting`, `review_triage`, `verified`, `blocked` | `blocked` if requested change is unsafe or ambiguous. | Fix commits, replies, check results. |
| `verified` | Local and relevant remote verification passed or was intentionally skipped. | Checks, self-review, CI, and review triage are acceptable. | Prepare final delivery report. | `/flow-report` | `final_reported`, `review_triage`, `blocked` | `blocked` if required evidence is missing. | Verification summary. |
| `final_reported` | Work is summarized for the user. | Verification evidence exists. | Report changed files, checks, issues, decisions, and risks. | `/flow-report` | `idle` | None. | Final report. |
| `blocked` | Agent cannot safely continue. | Missing information, invalid config, unsafe state, or human decision needed. | Stop, explain blocker, and ask for guidance. | `/flow-status` | Prior safe phase, `emergency`, `idle` | None. | Blocker report. |
| `emergency` | Explicit emergency path is active. | User requests urgent handling and provides reason. | Prefer `hotfix/` branch; still use structured payloads and final report. | `/flow-start`, `/flow-commit`, `/flow-pr`, `/flow-report` | `branch_prepared`, `planning`, `verified`, `final_reported`, `blocked` | `blocked` if reason or authority is missing. | Emergency reason, hotfix branch, report. |

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
