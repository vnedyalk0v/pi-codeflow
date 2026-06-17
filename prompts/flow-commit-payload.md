---
description: Produce a structured Codeflow commit payload only
argument-hint: "[context]"
---
Return a structured commit payload only. Do not render the final commit message.

Payload fields:
- type
- scope
- summary
- context
- changes
- verification
- risk
- refs
