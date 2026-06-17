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

Use `refs` values such as `#12`. Codeflow renders them with `Refs` by default.
