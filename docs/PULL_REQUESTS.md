# Pull Requests

The AI agent should not freeform-write the final PR title or body.

Instead:

1. The agent provides a structured PR payload.
2. Codeflow validates the payload.
3. Codeflow renders the PR title/body from `templates/pull-request.md` and the
   repository PR template.
4. Codeflow opens or updates the PR.

## PR title format

Use a concise Conventional Commits-style title that matches the primary change:

```text
feat(billing): add stripe webhook signature verification
```

If no scope applies:

```text
docs: harden v0.1 codeflow specifications
```

## Required PR body sections

- Summary
- Context
- Changes
- Verification
- Self-review
- Risk
- Rollback
- Reviewer notes
- Linked issues

## Required payload fields

| Field | Rule |
| --- | --- |
| `title` | Rendered PR title candidate. |
| `summary` | Short explanation of what the PR does. |
| `context` | Why the PR is needed. |
| `changes` | Non-empty list of notable changes. |
| `verification` | Commands run and results, or explicit skipped-check reasons. |
| `selfReview` | Agent's review of scope, docs, tests, and safety. |
| `risk` | Risk level and rationale. |
| `rollback` | How to revert or recover. |
| `reviewerNotes` | Notes that help reviewers focus. |
| `linkedIssues` | Issue references using `Refs` unless fully closing. |

## Optional payload fields

- `draft`: whether to open as a draft PR.
- `baseBranch`: override for the configured base branch.
- `labels`: suggested PR labels.
- `assignees`: suggested assignees.

## Draft PR behavior

The conservative default is to open draft PRs until local checks and self-review
are complete. A PR may be marked ready only when:

- configured checks have passed or are intentionally skipped with reasons;
- self-review found no blocking issues;
- the PR payload includes verification and risk notes;
- the branch targets an allowed base branch.

## Base branch selection

- Use the configured `pullRequest.baseBranch`, normally `dev`.
- Confirm the base branch exists before opening a PR.
- Do not target a reserved release branch unless an explicit emergency policy
  allows it.

## Self-review requirements

The PR body must summarize self-review evidence:

- task alignment
- tests and checks
- docs updates
- security or safety concerns
- known limitations

## CI status behavior

- After opening a PR, Codeflow should enter `ci_waiting` when GitHub checks are
  available.
- Failed checks should move the workflow back to a fix phase.
- Passing checks should be recorded in the final report.
- Missing or unavailable checks should be reported clearly.

## Reviewer comment loop behavior

- List unresolved comments.
- Classify each comment before acting.
- Fix valid comments.
- Re-run relevant checks.
- Reply with evidence.
- Resolve only comments that were fixed, stale, or already fixed according to
  policy.
- Stop for human input on `needs_human` comments.

## When not to create a PR

Do not create a PR when:

- there are no intended changes;
- config is invalid;
- the branch is a reserved branch during normal work;
- required checks failed and policy disallows opening failed-check PRs;
- the task requires a human decision before review;
- the payload cannot be validated.
