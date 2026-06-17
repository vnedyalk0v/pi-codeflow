---
description: Classify GitHub review comments for Codeflow
argument-hint: "<review comments>"
---
Classify each review comment before taking action.

Allowed classifications:

- valid
- invalid
- stale
- already_fixed
- needs_human

For each comment, return a structured payload with:

- id or URL
- classification
- rationale
- proposed action
- whether it may be resolved after verification

Do not resolve comments that are invalid or need human decision unless policy
explicitly allows it.
