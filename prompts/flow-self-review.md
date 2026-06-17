---
description: Review the current diff against the task
argument-hint: "[task context]"
---
Review the current diff against the task and Codeflow rules.

Return a structured self-review with:

- findings by severity
- task alignment
- missing tests or docs
- safety concerns
- suggested fixes
- whether the diff is ready for a structured commit payload

Do not write the final commit message.
