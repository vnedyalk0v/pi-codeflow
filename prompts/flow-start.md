---
description: Classify a task and produce Codeflow branch metadata
argument-hint: "<task or issue>"
---
Classify the task and produce branch metadata.

Input: $ARGUMENTS

Return only a structured payload with:
- type: one of feat, fix, hotfix, docs, chore, refactor, test, ci, build, perf
- scope: short optional scope
- slug: kebab-case task slug
- baseBranch: intended base branch
- reason: one sentence
- linkedRefs: issue or ticket references
