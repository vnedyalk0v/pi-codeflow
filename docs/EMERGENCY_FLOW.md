# Emergency Flow

Emergency behavior is intentionally outside the normal Codeflow path.

- Prefer a `hotfix/<ticket-or-slug>` branch over direct work on `main`.
- Direct work on reserved branches is out of normal scope.
- Any emergency override must require a reason.
- The final report must include the override reason, changed files, checks, linked issues, and residual risk.
- Destructive operations remain disallowed by default unless a maintainer explicitly approves them.
