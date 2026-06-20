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
9. watch CI with `/flow-watch`
10. triage review comments read-only with `/flow-comments`
11. produce final report

Rules:

- Use `/flow-start` to begin normal Codeflow work and prepare the semantic work
  branch.
- Use `/flow-check` after implementation changes to run configured local checks
  and record results.
- Use `/flow-commit` for Codeflow workflow commits when it is available; provide
  a structured payload and let Codeflow render the final message.
- Do not run raw `git commit` for Codeflow workflow commits when `/flow-commit`
  is available.
- Use `/flow-pr` for Codeflow workflow pull requests when it is available;
  provide a structured PR payload and let Codeflow render the final title/body.
- Do not run raw `gh pr create` for Codeflow workflow PRs when `/flow-pr` is
  available.
- Use `/flow-watch` after opening a PR to read and summarize GitHub PR checks.
- Remember that `/flow-watch` does not fix checks, rerun workflows, merge PRs,
  approve PRs, reply to comments, resolve comments, or delete branches.
- Use `/flow-comments` after `/flow-watch` to list and triage review threads
  read-only.
- Remember that `/flow-comments` does not implement `/flow-fix-comments`, code
  fixes, replies, thread resolution, GitHub mutations, merge automation, or
  auto-approval.
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
- Do not claim mutating review comment automation, merge automation, or
  auto-approval exists until those commands are implemented.
- Treat safety boundaries as fallback protection, not the normal workflow.
- Do not work directly on reserved branches unless an explicit emergency
  override exists; `/flow-start` may be invoked from a reserved branch only to
  move onto a semantic work branch.
- Stop for human decision when product, security, legal, merge, release, or
  ambiguous reviewer judgment is needed.
