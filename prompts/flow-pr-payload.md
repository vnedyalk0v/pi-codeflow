---
description: Produce a structured Codeflow PR payload only
argument-hint: "[context]"
---
Return a structured PR payload only. Do not render the final PR body.

Payload fields:
- title
- summary
- context
- changes
- verification
- selfReview
- risk
- rollback
- linkedIssues
