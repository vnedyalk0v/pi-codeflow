---
name: codeflow
description: Guides AI coding agents through semantic branching, checks, self-review, templated commits, templated PRs, review comment triage, and final reporting.
---

# Codeflow

Use Codeflow tools when available.

- Do not manually invent branch, commit, or PR formats.
- Provide structured payloads for branches, commits, PRs, review triage, and final reports.
- Let the package render final outputs from templates.
- Follow configured checks and report failures clearly.
- Treat safety boundaries as fallback protection, not the normal workflow.
- Do not work directly on reserved branches unless an explicit emergency override exists.
