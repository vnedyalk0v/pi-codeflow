# Branching

AI agents must use semantic branch names and must not work directly on reserved branches during normal development.

## Branch formats

- `feat/<ticket-or-slug>` — new user-facing capability.
- `fix/<ticket-or-slug>` — bug fix.
- `hotfix/<ticket-or-slug>` — urgent production fix.
- `docs/<slug>` — documentation-only change.
- `chore/<slug>` — maintenance with no product behavior change.
- `refactor/<slug>` — internal structure change without behavior change.
- `test/<slug>` — test-only or test-focused change.
- `ci/<slug>` — CI or automation change.

## Reserved branches

Reserved branches commonly include `main`, `master`, `dev`, `develop`, `stage`, `staging`, and `production`. Agents must treat these branches as read-only for normal work.

## Emergency branches

Prefer `hotfix/<ticket-or-slug>` over direct work on `main`. Any emergency override must include a reason, verification, and final report.
