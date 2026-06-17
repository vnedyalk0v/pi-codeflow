---
description: Classify a task and produce Codeflow branch metadata
argument-hint: "<task or issue>"
---
Classify the task and produce branch metadata.

Input: $ARGUMENTS

Return only a structured payload. Do not create the branch yourself when a
Codeflow branch tool is available.

Required fields:

- type: one of feat, fix, hotfix, refactor, perf, docs, test, chore, ci, build, revert
- scope: short optional scope
- slug: kebab-case task slug, maximum recommended length 60 characters
- baseBranch: intended base branch
- reason: one sentence explaining the classification
- linkedRefs: issue or ticket references
- emergency: boolean
- emergencyReason: required only when emergency is true
