# Plan 004: Design `/flow-watch` (GitHub checks watcher) — design and spike, not full build

> **Executor instructions**: This is a **design/spike plan**, not a build-it-all
> plan. The deliverable is a written design document plus a throwaway spike that
> de-risks the unknowns — NOT a production `/flow-watch` command. Do not ship the
> command. Follow the steps, answer the open questions with evidence, and stop at
> the design deliverable. If anything in "STOP conditions" occurs, stop and report.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 554971d..HEAD -- src/github docs/WORKFLOW.md docs/ARCHITECTURE.md src/lifecycle`
> If these changed materially since this plan was written (e.g. `/flow-watch`
> already started), reconcile against the live code before proceeding.

## Status

- **Priority**: P2 (direction)
- **Effort**: M (design and spike; full implementation is a separate, later plan)
- **Risk**: LOW (no production behavior ships in this plan)
- **Depends on**: none (builds on the shipped `/flow-pr` bounded PR state)
- **Category**: direction
- **Planned at**: commit `554971d`, 2026-06-18

## Why this matters

`/flow-watch` is the next command on the roadmap and the only missing link
between "PR opened" and "verified" in the lifecycle. It is named in the README
command surface, has a dedicated lifecycle phase already defined
(`ci_waiting`), a documented workflow step (`docs/WORKFLOW.md:265-279`), and is
explicitly scheduled as issue **#13 / v0.7** — "GitHub checks watcher is next
after #12 … build on the bounded PR metadata produced by `/flow-pr` without
adding review comment or merge automation" (`docs/IMPLEMENTATION_PLAN.md:108-114`).

The intent is decided; what's undecided is the *contract* — how Codeflow reads
check status conservatively (read-only, no merge/approve), how it represents
"running / passed / failed / unavailable", how it polls vs. samples once, and
how it drives the `ci_waiting → verified | fixing_local_findings | blocked`
transitions. Specifying that contract before code is written is the highest-value
move, because `/flow-watch` touches the security boundary (`docs/SECURITY_MODEL.md`
forbids watching CI from `/flow-pr`/`/flow-commit`; `/flow-watch` is the *only*
place it's allowed) and a wrong contract is expensive to unwind once shipped.

## Current state — what already exists to build on

- **GitHub CLI wrapper**: `src/github/gh-client.ts` — `GhClient.run(args: string[])`
  returns `{ stdout, stderr, args }`, throws typed `GithubCliError`
  (`gh_missing`, `gh_auth_required`, `gh_command_failed`). This is the
  read-only-friendly seam to reuse; `gh pr checks <number> --json …` and
  `gh pr view <number> --json statusCheckRollup` run through it unchanged.
- **Bounded PR state**: `src/state/pr-state.ts` — `CodeflowStoredPullRequest`
  holds `{ number, url, baseBranch, headBranch, title, draft, createdAt }`. A
  watcher reads `sessionState.pullRequests.lastPullRequest.number` to know what
  to watch.
- **Lifecycle**: `src/lifecycle/lifecycle-phase.ts:1-19` already lists
  `'pr_opened'`, `'ci_waiting'`, `'verified'`, `'fixing_local_findings'`,
  `'blocked'`. `docs/WORKFLOW.md:265-279` defines `ci_waiting` allowed
  transitions: `verified`, `fixing_local_findings`, `review_triage`, `blocked`;
  failure → `fixing_local_findings`; unavailable status → `blocked`.
- **Command pattern to mirror** (do not deviate from it): every command is a
  `runFlowX(options)`, `parseFlowXArguments(args)`, and `formatFlowXResult(result)`
  trio, registered in `src/extension.ts`, returning a result that carries
  `nextExpectedActions`, `warnings`, and an updated `sessionState`. See
  `src/commands/flow-check.ts` (closest analog: it summarizes a run and updates
  session state) and `src/commands/flow-pr.ts`.
- **Security boundary to honor**: `docs/SECURITY_MODEL.md:118-131` — `/flow-pr`
  and `/flow-commit` must never watch CI, merge, approve, request reviews, or
  resolve comments. `/flow-watch` must be **read-only**: it observes check status
  and reports; it must not merge, approve, rerun checks by default, or resolve
  comments. `docs/WORKFLOW.md:271` scopes its job to "watch checks and summarize
  status."
- **Redaction**: any check output surfaced to the user/agent must pass through
  the existing `redactSecrets`/`truncateForSummary` helpers
  (`src/checks/check-summary.ts`) — CI logs can contain tokens.

## Commands you will need

| Purpose          | Command                                   | Expected on success |
|------------------|-------------------------------------------|---------------------|
| Typecheck        | `npm run typecheck`                       | exit 0              |
| Tests            | `npx vitest run`                          | all pass            |
| Docs check       | `node scripts/check-docs-format.mjs`      | exit 0              |
| Inspect gh JSON  | `gh pr checks --help` / `gh pr view --help` | help text          |

> The spike may run **read-only** `gh` commands against a real PR if `gh` is
> authenticated in this environment. If `gh` is missing or unauthenticated,
> record that and design against the documented `gh` JSON schema instead — do
> not attempt `gh auth login`.

## Suggested executor toolkit

- If a `claude-code-guide`-style helper or the `gh` CLI manual is available, use
  it to confirm the exact JSON fields of `gh pr checks --json` and
  `gh pr view --json statusCheckRollup` for the installed `gh` version.

## Scope

**In scope** (the only files you should create/modify):
- `docs/decisions/0002-flow-watch-contract.md` (create — the design ADR;
  follow the format of the existing `docs/decisions/0001-package-scope.md`)
- `plans/005-flow-watch-implementation.md` (create — the follow-up build plan
  this design produces, written to the same template as the other plans here)
- A throwaway spike under `spike/flow-watch/` (create) — scratch code only, NOT
  wired into `src/` or `extensions/`; it exists to verify `gh` JSON shapes.

**Out of scope** (do NOT do in this plan):
- Any change under `src/`, `extensions/`, `schemas/`, or the command registry —
  `/flow-watch` does not ship here.
- Review-comment triage, merge, approve, auto-rerun — those are later issues
  (`docs/IMPLEMENTATION_PLAN.md` non-goals); the design must explicitly exclude
  them.
- Polling that blocks indefinitely — see open question Q3.

## Git workflow

- Branch: `docs/flow-watch-design` (design artifacts are docs and a spike dir;
  per `AGENTS.md`, spec/design work uses a `docs/` branch and adds no production
  extension logic).
- Conventional Commits, e.g. `docs(decisions): record /flow-watch read-only contract`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the `gh` status surface (spike)

In `spike/flow-watch/`, write a tiny script (or notes file) that runs, read-only:
- `gh pr checks <number> --json name,state,bucket,link,workflow` (capture the
  exact field names/values the installed `gh` returns), and
- `gh pr view <number> --json statusCheckRollup,mergeStateStatus`.

Record the real JSON shapes and the full set of `state`/`bucket` values you
observe (e.g. `pass`, `fail`, `pending`, `skipping`, …). If `gh` is unavailable,
record that and transcribe the documented schema from `gh pr checks --help`
instead.

**Verify**: `spike/flow-watch/` contains the captured JSON shapes and the
enumerated status values, with a note on the `gh` version (`gh --version`).

### Step 2: Define the status model and transition mapping

In the ADR (`docs/decisions/0002-flow-watch-contract.md`), specify:
- A normalized Codeflow check-status enum (proposed: `running`, `passed`,
  `failed`, `unavailable`) and the exact mapping from `gh` `state`/`bucket`
  values (from Step 1) to it.
- The `ci_waiting` transition rules, reconciled with `docs/WORKFLOW.md:273-276`:
  all passed → `verified`; any required failed → `fixing_local_findings`;
  status unavailable / `gh` not authenticated → `blocked`; still running → stay
  `ci_waiting`.
- How "required vs. optional" check distinction is determined (or, if `gh`
  doesn't expose it cleanly, an explicit decision to treat all as required for v1
  and note the limitation).

**Verify**: `node scripts/check-docs-format.mjs` → exit 0; the ADR contains the
mapping table.

### Step 3: Specify the command contract

In the ADR, define the `/flow-watch` surface to match the existing command trio
pattern, without implementing it:
- `parseFlowWatchArguments` flags (proposed: `--once` for a single sample vs.
  default bounded poll; `--timeout <ms>`; no flag that triggers merge/rerun).
- `runFlowWatch(options)` inputs (cwd, the PR number sourced from session state
  or an explicit `--pr <number>`, an injectable `GhClient` for tests like the
  other commands), and the result shape (`status`, normalized check list,
  `lifecyclePhase`, `nextExpectedActions`, `warnings`, updated `sessionState`).
- The read-only guarantee, stated explicitly: enumerate the `gh` subcommands
  `/flow-watch` is allowed to call (only `pr checks`, `pr view`) and the ones it
  must never call (`pr merge`, `pr review`, `pr ready`, `pr comment`, …).
- Redaction: CI output shown to the agent goes through `truncateForSummary`.

**Verify**: the ADR's command-contract section names every input, output field,
and the allowed/forbidden `gh` subcommand lists.

### Step 4: Answer the open questions

Resolve each open question (below) in the ADR with a decision and one line of
rationale, or mark it explicitly deferred to implementation with the reason.

**Verify**: every Q has a recorded decision or a deferral note.

### Step 5: Write the implementation follow-up plan

Create `plans/005-flow-watch-implementation.md` using the same template as the
plans in this directory (`001`–`003`): in-scope files (`src/github/checks-client.ts`,
`src/checks/check-status.ts` or similar, `src/commands/flow-watch.ts`,
`src/extension.ts` registration, `src/state/*`, tests, plus `docs`/`schemas`
updates), verification gates (`npm run check`), and the test plan modeled on
`tests/commands/flow-pr.test.ts` (injected fake `GhClient`). It should reference
the ADR for the decided contract so the build executor inherits zero ambiguity.

**Verify**: `plans/005-flow-watch-implementation.md` exists and its Scope and
Done-criteria sections are filled from the ADR decisions (no "TBD").

### Step 6: Decide the fate of the spike

Either delete `spike/flow-watch/` (preferred — its findings now live in the ADR)
or, if kept for reference, add a one-line note in the ADR pointing to it and
confirm it is not imported by anything in `src/`/`extensions/`.

**Verify**: `grep -rn "spike/flow-watch" src extensions` returns nothing.

## Open questions (must be answered in the ADR)

- **Q1** — Required vs. optional checks: does the installed `gh` expose this per
  check, or must v1 treat all checks as required? (Affects the `failed` →
  `fixing_local_findings` rule.)
- **Q2** — Source of the PR number: session state only, or also an explicit
  `--pr <number>` for cross-session use? (Session state is in-memory per process,
  so a fresh agent run has no `lastPullRequest`.)
- **Q3** — Poll vs. single sample: does v1 block-poll with a timeout, or take one
  sample and report `running` with a "run again" next-action? Blocking polls
  interact badly with agent turn limits — recommend single-sample default,
  `--watch`/`--timeout` opt-in, and decide here.
- **Q4** — Authentication failure: confirm `gh_auth_required` maps to `blocked`
  (not a hard throw) so the agent gets a clear next action.

## Done criteria

ALL must hold:

- [ ] `docs/decisions/0002-flow-watch-contract.md` exists with: the `gh`→Codeflow
      status mapping table, the `ci_waiting` transition rules, the command
      contract (inputs/outputs/allowed+forbidden `gh` subcommands), and a decision
      for each open question Q1–Q4
- [ ] `plans/005-flow-watch-implementation.md` exists, template-complete, with no
      "TBD" in Scope or Done criteria
- [ ] `node scripts/check-docs-format.mjs` exits 0
- [ ] `npm run check` exits 0 (no `src/` changes means the existing suite is
      unaffected)
- [ ] `grep -rn "spike/flow-watch" src extensions` returns nothing (spike not
      wired into production)
- [ ] `plans/README.md` status row updated, and plan 005 added to the index

## STOP conditions

Stop and report back (do not improvise) if:

- The `gh` JSON shape differs materially from what the design assumes and you
  cannot determine the correct field names from `gh ... --help` — report what
  `gh` actually returns.
- Satisfying the design appears to require shipping production `src/` code
  (it should not — that is plan 005's job).
- `docs/WORKFLOW.md`/`docs/ARCHITECTURE.md` describe a `ci_waiting` contract that
  contradicts what the spike shows is feasible — surface the contradiction; do
  not silently pick one.
- You discover `/flow-watch` has already been partially implemented since 554971d
  (drift) — reconcile against the live code and report.

## Maintenance notes

- This plan deliberately ships **no production behavior**. The product change is
  plan 005, gated on the ADR landing.
- Keep `/flow-watch` strictly read-only. Any later desire to rerun checks, merge,
  or resolve comments is a separate issue with its own security review — the ADR
  should say so.
- Reviewer focus on the ADR: confirm the allowed/forbidden `gh` subcommand lists
  honor `docs/SECURITY_MODEL.md`, and that redaction is required on any surfaced
  CI output.
