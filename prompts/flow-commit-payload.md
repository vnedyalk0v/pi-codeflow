---
description: Produce a structured Codeflow commit payload only
argument-hint: "[context]"
---
Analyze the staged diff and return a structured commit payload only.

Do not write the final commit message.
Do not include prose outside the payload.
The package renders the final commit message from the commit template.

Payload fields:

- type
- scope
- summary
- context
- changes
- verification
- risk
- refs
- riskLevel, optional: low, medium, or high
