# Codeflow Workflow

## Expected lifecycle

1. **Start task** — understand the request, linked issue, constraints, and expected outcome.
2. **Create semantic branch** — choose an allowed branch type and branch from the configured base branch.
3. **Plan implementation** — produce a concise plan with files, tests, risks, and rollback notes.
4. **Implement** — make focused changes that match the issue and plan.
5. **Run checks** — execute configured checks in order and capture results.
6. **Self-review** — review the current diff against the task, docs, and safety rules.
7. **Fix local findings** — address self-review issues before committing.
8. **Create templated commit** — provide a structured commit payload and render the commit message.
9. **Open templated PR** — provide a structured PR payload and render the PR title/body.
10. **Watch CI** — monitor configured GitHub checks and summarize failures.
11. **Triage reviewer comments** — classify comments as valid, invalid, stale, already fixed, or needing human input.
12. **Fix valid comments** — implement fixes for valid comments in small commits.
13. **Re-run checks** — verify comment fixes locally and through CI when applicable.
14. **Reply and resolve addressed comments** — resolve only comments that were addressed or proven stale/already fixed.
15. **Final report** — summarize changed files, checks, linked issues, decisions, and residual risks.
