---
description: Start a Codeflow task with deterministic branch preparation
argument-hint: "[--type <type>] [--ticket <ticket>] [--emergency] [--dry-run] <task>"
---
Start a Codeflow task using the `/flow-start` command when available.

Input: $ARGUMENTS

Do not invent the final branch name manually. Codeflow deterministically
validates or infers the branch type, detects or accepts a ticket, renders the
semantic branch name from config/template rules, checks branch safety, and
prepares the work branch.

Expected command examples:

- `/flow-start --type feat "Add Google OAuth login"`
- `/flow-start --ticket BILL-142 --type feat "Add Stripe webhook verification"`
- `/flow-start "Fix checkout timeout"`
- `/flow-start --emergency "Checkout is down in production"`

If `/flow-start` is unavailable, return a structured branch payload only and
explain that branch preparation tooling is unavailable.

Required payload fields when tooling is unavailable:

- type: one of feat, fix, hotfix, refactor, perf, docs, test, chore, ci, build, revert
- task: original task description
- ticket: optional issue or ticket reference
- baseBranch: intended base branch
- emergency: boolean
- emergencyReason: required only when emergency is true
