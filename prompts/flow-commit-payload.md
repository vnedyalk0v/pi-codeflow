---
description: Produce a structured Codeflow commit payload only
argument-hint: "[context]"
---
Analyze the staged diff and return a structured commit payload only.

Do not write the final commit message.
Do not include prose outside the payload.
Do not invent a commit title or body.
Codeflow renders the final commit message from the configured commit template.

Return JSON with these fields:

- `type`
- `scope`, optional
- `summary`
- `context`
- `changes`
- `verification`
- `risk`
- `refs`, optional
- `breakingChange`, optional
- `footers`, optional

Rules:

- `summary` must be concrete, concise, and have no trailing period.
- `changes` must contain at least one item.
- `verification` must contain commands run or explicit skipped-check reasons.
- `risk` must explain the risk level and rationale.
- The payload is not the final commit message.
