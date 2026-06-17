---
description: Run configured Codeflow local checks
argument-hint: "[--dry-run] [--all|--continue-on-failure|--stop-on-failure]"
---
Run configured Codeflow local checks using `/flow-check` when available.

Input: $ARGUMENTS

Do not add a command argument. `/flow-check` must run only commands from the
resolved `config.checks` array.

Expected command examples:

- `/flow-check`
- `/flow-check --dry-run`
- `/flow-check --all`
- `/flow-check --stop-on-failure`
- `/flow-check --continue-on-failure`

Required result fields to report:

- overall status
- checks run
- passed checks
- failed checks
- skipped checks
- duration
- failure summary when relevant
- next expected actions

Do not commit, push, open a PR, run GitHub checks, perform self-review, or
resolve review comments from this prompt.
