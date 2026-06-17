---
description: Produce a structured Codeflow PR payload only
argument-hint: "[context]"
---
Return a structured PR payload only.

Do not write the final PR body.
Do not include prose outside the payload.
The package renders the final PR title and body from templates.

Payload fields:

- title
- summary
- context
- changes
- verification
- selfReview
- risk
- rollback
- reviewerNotes
- linkedIssues
- draft, optional
- baseBranch, optional
