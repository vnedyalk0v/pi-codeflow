# Review Comment Triage

Codeflow should classify unresolved review comments before taking action.

## Classifications

- `valid` — the comment identifies a real issue that should be fixed.
- `invalid` — the comment is not applicable or is based on a misunderstanding.
- `stale` — the commented code no longer exists or the comment no longer applies.
- `already_fixed` — the issue has already been addressed by existing changes.
- `needs_human` — the agent cannot safely decide or act without maintainer input.

## Resolution rule

Comments should not be resolved unless actually addressed or proven `stale` / `already_fixed`. Invalid comments should receive a clear reply and normally remain for human review unless maintainers configure otherwise.
