---
name: codeflow
description: >-
  Guides AI coding agents through semantic branching, checks, self-review,
  templated commits, templated PRs, review comment triage, and final reporting.
---

# Codeflow

Use Codeflow when a task involves repository changes, branch management,
commits, pull requests, local checks, CI, reviewer comments, or delivery reports.

Follow the Codeflow lifecycle:

1. initialize task
2. prepare semantic branch
3. plan
4. implement
5. run local checks
6. self-review
7. provide structured commit payload
8. provide structured PR payload
9. watch CI and triage review comments
10. produce final report

Rules:

- Use `/flow-start` to begin normal Codeflow work and prepare the semantic work
  branch.
- Use `/flow-check` after implementation changes to run configured local checks
  and record results.
- Use `/flow-commit` for Codeflow workflow commits when it is available; provide
  a structured payload and let Codeflow render the final message.
- Do not run raw `git commit` for Codeflow workflow commits when `/flow-commit`
  is available.
- Use other Codeflow tools when available.
- If a Codeflow tool is not implemented yet, explain the limitation instead of
  pretending it exists.
- Avoid raw git workflow operations when Codeflow tools exist.
- Do not manually invent branch, commit, PR, review reply, or final report
  formats.
- Provide structured payloads for branches, commits, PRs, review triage, and
  final reports.
- Let templates render final outputs.
- Follow configured checks through `/flow-check` and report failures clearly.
- Do not claim `/flow-pr` or PR rendering is implemented until that command
  exists.
- Treat safety boundaries as fallback protection, not the normal workflow.
- Do not work directly on reserved branches unless an explicit emergency
  override exists; `/flow-start` may be invoked from a reserved branch only to
  move onto a semantic work branch.
- Stop for human decision when product, security, legal, merge, release, or
  ambiguous reviewer judgment is needed.
