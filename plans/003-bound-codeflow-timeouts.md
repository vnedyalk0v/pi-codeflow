# Plan 003: Bound configured Codeflow timeouts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report -
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**: run the command below. If any in-scope file
> changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP
> condition.

```sh
git diff --stat 14dc53a..HEAD -- \
  schemas/codeflow.schema.json \
  src/checks/check-command.ts \
  src/commands/flow-watch.ts \
  src/github/pr-checks-client.ts \
  tests/config/validate-config.test.ts \
  tests/commands/flow-watch.test.ts \
  tests/checks/check-runner.test.ts \
  docs/CONFIGURATION.md
```

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `14dc53a`, 2026-06-22

## Why this matters

Codeflow accepts project-configured timeouts for local checks and GitHub check
watching. Today those values only need to be positive. A typo such as
`900000000` can leave an agent session waiting far longer than intended. The
fix is a small upper bound in schema and runtime validation, with documentation
for the limits.

## Current state

- `schemas/codeflow.schema.json`: schema for project config.
- `src/checks/check-command.ts`: resolves per-check timeout config.
- `src/commands/flow-watch.ts`: validates `/flow-watch` CLI/config timing.
- `src/github/pr-checks-client.ts`: validates direct GitHub watch options.
- `docs/CONFIGURATION.md`: documents timeout fields.

Current excerpts:

```text
schemas/codeflow.schema.json:362-370
"checksWatchIntervalSeconds": {
  "type": "integer",
  "minimum": 1,
  "description": "Default polling interval in seconds for /flow-watch."
},
"checksWatchTimeoutSeconds": {
  "type": "integer",
  "minimum": 1,
  "description": "Default timeout in seconds for /flow-watch."
}
```

```text
schemas/codeflow.schema.json:401-408
"timeoutMs": {
  "type": "integer",
  "minimum": 1
},
"timeoutSeconds": {
  "type": "integer",
  "minimum": 1,
  "description": "Backward-compatible timeout in seconds; prefer timeoutMs for new configs."
}
```

```text
src/commands/flow-watch.ts:398-400
function validateFlowWatchTiming(intervalSeconds: number, timeoutSeconds: number): void {
  parsePositiveInteger(String(intervalSeconds), 'intervalSeconds');
  parsePositiveInteger(String(timeoutSeconds), 'timeoutSeconds');
}
```

```text
src/checks/check-command.ts:58-70
export function resolveTimeoutMs(check: CodeflowCheckConfig): number | undefined {
  const timeoutMs = check.timeoutMs ??
    (check.timeoutSeconds === undefined ? undefined : check.timeoutSeconds * 1000);

  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new CodeflowCheckError({
      code: 'invalid_check_config',
      message: `Codeflow check ${check.name} has an invalid timeout.`,
      details: { timeoutMs },
    });
  }

  return timeoutMs;
}
```

Existing defaults:

```text
config/default.codeflow.json:89-90
"checksWatchIntervalSeconds": 10,
"checksWatchTimeoutSeconds": 900,
```

Repo conventions:

- Schema catches config-shape issues.
- Runtime validation catches programmatic options and merged config values.
- Tests live beside command/config behavior in `tests/commands`,
  `tests/config`, and `tests/checks`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Config tests | `npm test -- tests/config/validate-config.test.ts` | all selected tests pass |
| Watch tests | `npm test -- tests/commands/flow-watch.test.ts tests/github/pr-checks-client.test.ts` | all selected tests pass |
| Check tests | `npm test -- tests/checks/check-runner.test.ts` | all selected tests pass |
| Typecheck | `npm run typecheck` | exit 0 |
| Full gate | `npm run check` | exit 0 |

## Scope

**In scope**:

- `schemas/codeflow.schema.json`
- `src/checks/check-command.ts`
- `src/commands/flow-watch.ts`
- `src/github/pr-checks-client.ts`
- `tests/config/validate-config.test.ts`
- `tests/commands/flow-watch.test.ts`
- `tests/github/pr-checks-client.test.ts`
- `tests/checks/check-runner.test.ts`
- `docs/CONFIGURATION.md`
- `plans/README.md`

**Out of scope**:

- Changing default timeout values.
- Adding new config keys.
- Adding dependencies.
- Changing how checks are executed.

## Git workflow

- Branch: `fix/003-bound-codeflow-timeouts`
- Commit style: conventional commit, for example `fix: bound codeflow timeouts`
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add schema maximums

In `schemas/codeflow.schema.json`, add these maximums:

- `pullRequest.checksWatchIntervalSeconds`: maximum `300`
- `pullRequest.checksWatchTimeoutSeconds`: maximum `3600`
- check `timeoutMs`: maximum `3600000`
- check `timeoutSeconds`: maximum `3600`

These bounds allow long CI waits but prevent accidental multi-day waits.

Add validation tests in `tests/config/validate-config.test.ts` that prove values
above those limits are rejected. Use the existing validation-error tests as the
pattern.

**Verify**:

```sh
npm test -- tests/config/validate-config.test.ts
```

Expected: all tests pass and the new tests fail with `keyword: 'maximum'` when
values exceed the bounds.

### Step 2: Add runtime bounds for local check timeouts

In `src/checks/check-command.ts`, add a local constant:

```ts
const MAX_CHECK_TIMEOUT_MS = 3_600_000;
```

Extend `resolveTimeoutMs` so values above that constant throw
`CodeflowCheckError` with code `invalid_check_config`.

Add or update a test in `tests/checks/check-runner.test.ts` that passes a check
with an excessive timeout and expects `invalid_check_config`.

**Verify**:

```sh
npm test -- tests/checks/check-runner.test.ts
```

Expected: all tests pass.

### Step 3: Add runtime bounds for `/flow-watch`

In `src/commands/flow-watch.ts`, add local constants:

```ts
const MAX_FLOW_WATCH_INTERVAL_SECONDS = 300;
const MAX_FLOW_WATCH_TIMEOUT_SECONDS = 3600;
```

Update `validateFlowWatchTiming` and argument parsing behavior so both config
defaults and CLI flags reject values above those bounds with
`CodeflowPrChecksError`.

In `src/github/pr-checks-client.ts`, keep direct exported watch use safe too:
update `assertPositiveSeconds` or add a small max check so
`watchGitHubPrChecks({ timeoutSeconds: 999999 })` rejects.

Add tests:

- `tests/commands/flow-watch.test.ts`: excessive `--interval` and `--timeout`
  are rejected.
- `tests/github/pr-checks-client.test.ts`: direct excessive `timeoutSeconds` is
  rejected.

**Verify**:

```sh
npm test -- tests/commands/flow-watch.test.ts tests/github/pr-checks-client.test.ts
```

Expected: all selected tests pass.

### Step 4: Document the bounds

Update `docs/CONFIGURATION.md` so the timeout field descriptions include the
maximums:

- watch interval: `1` to `300` seconds;
- watch timeout: `1` to `3600` seconds;
- check timeout: `1` to `3600000` ms or `1` to `3600` seconds.

Do not change examples unless an example violates the new bounds.

**Verify**:

```sh
npm run check:docs
```

Expected: exits 0.

### Step 5: Run the full gate and update plan status

Run:

```sh
npm run typecheck
npm run check
git diff --check
```

Expected: all commands exit 0.

Update this plan's row in `plans/README.md` from `TODO` to `DONE` only after
the changes and checks pass.

## Test plan

- Schema tests reject over-limit config values.
- `/flow-watch` command tests reject over-limit CLI values.
- GitHub checks client tests reject over-limit direct watch options.
- Check runner tests reject over-limit local check timeouts.

## Done criteria

- [ ] Schema maximums exist for watch interval, watch timeout, `timeoutMs`, and
      `timeoutSeconds`.
- [ ] Runtime validation rejects the same over-limit values.
- [ ] Existing defaults remain unchanged.
- [ ] `docs/CONFIGURATION.md` documents the bounds.
- [ ] Focused tests listed above pass.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run check` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- Existing example configs or tests rely on timeouts above the proposed bounds.
- The max values need to be configurable to support an existing documented use.
- Adding runtime checks requires a new shared validation module.
- The in-scope files changed and no longer match the excerpts above.

## Maintenance notes

Keep the bounds boring constants. Do not add a new configuration layer unless a
real project needs different limits. Reviewers should check schema and runtime
limits stay in sync.
