# Plan 004: Align the `/flow-watch` ADR with implemented defaults

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report -
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 14dc53a..HEAD -- docs/decisions/0002-flow-watch-contract.md docs/WORKFLOW.md src/commands/flow-watch.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live files before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `14dc53a`, 2026-06-22

## Why this matters

ADR 0002 says `/flow-watch --once` is the default and `--watch` opts into
bounded polling. The implemented command now defaults to watch mode, and the
current workflow/config docs also describe watch mode as the default. Leaving
the ADR stale invites future agents to "fix" the code back to an old decision.

## Current state

- `docs/decisions/0002-flow-watch-contract.md`: older ADR text.
- `docs/WORKFLOW.md`: current user workflow documentation.
- `src/commands/flow-watch.ts`: implemented command default.

Current excerpts:

```text
docs/decisions/0002-flow-watch-contract.md:135-137
- `--once`: explicit single-sample mode. This is also the default.
- `--watch`: opt into bounded polling by repeating the read-only sample until a
  terminal status or timeout.
```

```text
docs/decisions/0002-flow-watch-contract.md:214-216
- **Q3 poll vs. single sample:** default to a single sample; add `--watch` with
  `--timeout <ms>` for bounded polling. Rationale: single samples fit agent turn
  limits, and polling must never block indefinitely.
```

```text
src/commands/flow-watch.ts:69-73
const requiredOnly = options.requiredOnly ?? config.pullRequest.watchRequiredChecksOnly;
const watch = options.watch ?? true;
const failFast = options.failFast ?? config.pullRequest.failFast;
const intervalSeconds = options.intervalSeconds ?? config.pullRequest.checksWatchIntervalSeconds;
const timeoutSeconds = options.timeoutSeconds ?? config.pullRequest.checksWatchTimeoutSeconds;
```

```text
docs/WORKFLOW.md:136-140
After a PR exists, `/flow-watch` loads the resolved config, determines the target
PR from `--pr`, latest `/flow-pr` state, or the current branch PR, then reads
GitHub PR checks. By default it watches required checks only with the configured
interval and timeout. `--all` watches all returned PR checks, while `--required`
keeps the required-only filter explicit.
```

Repo conventions:

- ADRs should preserve historical context but clearly mark superseded decisions.
- Do not silently rewrite history if a decision changed later.
- Keep docs concise.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Docs validation | `npm run check:docs` | exit 0 |
| Text safety | `npm run check:text` | exit 0 |
| Full gate | `npm run check` | exit 0 |

## Scope

**In scope**:

- `docs/decisions/0002-flow-watch-contract.md`
- `plans/README.md`

**Reference only, do not edit unless drift requires it**:

- `docs/WORKFLOW.md`
- `src/commands/flow-watch.ts`

**Out of scope**:

- Runtime behavior changes.
- Test changes.
- New ADR files.
- Rewriting unrelated ADR sections.

## Git workflow

- Branch: `docs/004-align-flow-watch-adr`
- Commit style: conventional commit, for example `docs: align flow-watch ADR`
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm implemented default

Open `src/commands/flow-watch.ts` and verify the command still defaults to
watch mode:

```ts
const watch = options.watch ?? true;
```

If the implementation now defaults to single-sample mode, STOP and report that
the ADR may no longer be stale.

**Verify**:

```sh
rg -n "const watch = options\\.watch \\?\\? true" src/commands/flow-watch.ts
```

Expected: one match.

### Step 2: Mark the old ADR text as superseded

In `docs/decisions/0002-flow-watch-contract.md`, keep the historical decision
but add a short note near the command contract or Q3 section:

- this ADR originally specified single-sample mode as the default;
- the implemented command now defaults to bounded watch mode;
- `/flow-watch --once` remains the explicit single-sample escape hatch;
- `docs/WORKFLOW.md` and `docs/CONFIGURATION.md` describe current behavior.

Do not rewrite the whole ADR. The smallest clear supersession note is enough.

**Verify**:

```sh
rg -n "superseded|implemented command now defaults|--once" docs/decisions/0002-flow-watch-contract.md
```

Expected: the ADR has a clear note that current implementation differs from the
original default.

### Step 3: Validate docs and update plan status

Run:

```sh
npm run check:docs
npm run check:text
npm run check
git diff --check
```

Expected: all commands exit 0.

Update this plan's row in `plans/README.md` from `TODO` to `DONE` only after
the changes and checks pass.

## Test plan

- No runtime tests are required because this plan only updates an ADR.
- `npm run check:docs` and `npm run check:text` cover documentation formatting
  and text safety.

## Done criteria

- [ ] ADR 0002 no longer presents single-sample mode as the current default.
- [ ] ADR 0002 preserves the historical decision context.
- [ ] Current behavior remains unchanged.
- [ ] `npm run check:docs` exits 0.
- [ ] `npm run check:text` exits 0.
- [ ] `npm run check` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- `src/commands/flow-watch.ts` no longer defaults to watch mode.
- `docs/WORKFLOW.md` no longer agrees with the implementation.
- The ADR has already been updated by another change.
- The fix appears to require changing runtime behavior.

## Maintenance notes

When ADR decisions change after implementation, mark the old decision as
superseded instead of deleting history. Reviewers should check future command
behavior changes update user docs and ADR notes together.
