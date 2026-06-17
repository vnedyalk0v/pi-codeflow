---
description: Classify GitHub review comments for Codeflow
argument-hint: "<review comments>"
---
Classify each review comment.

Allowed classifications:
- valid
- invalid
- stale
- already_fixed
- needs_human

For each comment, return:
- id or URL
- classification
- rationale
- proposed action
- whether it may be resolved after verification
