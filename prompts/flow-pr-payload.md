---
description: Produce a structured Codeflow PR payload only
argument-hint: "[context]"
---
Return a structured Codeflow PR payload only.

Do not write the final PR title.
Do not write the final PR body.
Do not include prose outside the payload.
Codeflow renders the final PR title and body from configured templates.

Expected JSON shape:

```json
{
  "title": {
    "type": "feat",
    "scope": "pull-requests",
    "summary": "implement generated pull requests",
    "ticket": "FLOW-12"
  },
  "body": {
    "summary": "Short summary of the PR.",
    "context": "Why the PR is needed.",
    "changes": ["Notable change."],
    "verification": ["Command and result."],
    "selfReview": ["Self-review evidence."],
    "risk": "Risk level and rationale.",
    "rollback": "How to revert or recover.",
    "reviewerNotes": "Optional reviewer focus notes.",
    "refs": ["#12"]
  },
  "draft": true,
  "baseBranch": "dev",
  "headBranch": "feat/example"
}
```

Required fields:

- `title.type`
- `title.summary`
- `body.summary`
- `body.context`
- `body.changes`
- `body.verification` unless policy explicitly allows omission
- `body.selfReview` unless policy explicitly allows omission
- `body.risk`
- `body.rollback`

Optional fields:

- `title.scope`
- `title.ticket`
- `body.reviewerNotes`
- `body.refs`
- `draft`
- `baseBranch`
- `headBranch`

Branch fields:

- Omit `baseBranch` unless overriding the configured PR base.
- Omit `headBranch` unless overriding the current branch.
- If present, both must be Codeflow git branch names: no leading `-` or `+`, no
  `refs/` prefix, no literal `HEAD` or `@`, no whitespace/control characters,
  no Git ref metacharacters (`..`, `@{`, `~`, `^`, `:`, `?`, `*`, `[`, `\\`),
  no empty or leading-dot path components, no `.lock` path components, and no
  trailing `/` or `.`.
- Use branch names such as `dev` or `feat/example`, not fully qualified refs
  such as `refs/heads/dev`.

Use `refs` values such as `#12`. Codeflow renders them with `Refs` by default.
