# Emergency Flow

Emergency behavior is intentionally outside the normal Codeflow path. It exists
for urgent work, but it should still preserve structure, verification, and audit
trail.

## Default emergency path

The default emergency path is a hotfix branch, not direct work on `main`:

```text
hotfix/<ticket-or-slug>
```

Direct work on reserved branches is outside normal scope.

## Required emergency inputs

Emergency flow requires:

- explicit reason from the user;
- branch target and base branch;
- known urgency or incident reference when available;
- verification expectations;
- follow-up expectations for `dev`.

## Required emergency behavior

- Prefer a `hotfix/` branch over direct reserved-branch work.
- Keep commits structured.
- Keep PRs structured.
- Run configured checks unless the user explicitly accepts skipped checks.
- Include skipped-check reasons in the final report.
- Include the emergency reason in the final report.
- Do not perform destructive operations unless explicitly approved.

## Reserved branch override

If a user requests direct work on a reserved branch, Codeflow should:

1. Explain that direct reserved-branch work is outside normal scope.
2. Suggest a `hotfix/` branch instead.
3. Require explicit confirmation and reason if the user insists.
4. Record the override and risk in the final report.

## Follow-up backport or cherry-pick

Emergency fixes often need to land back in the normal integration branch.
Codeflow should document follow-up work, such as:

- cherry-pick hotfix commit to `dev`;
- open a backport PR;
- reconcile conflicts;
- re-run normal checks;
- update incident notes.

## Final report requirements

Emergency final reports must include:

- emergency reason;
- changed files;
- commits and PRs;
- checks run and skipped;
- linked issues or incidents;
- residual risk;
- follow-up backport/cherry-pick plan.
