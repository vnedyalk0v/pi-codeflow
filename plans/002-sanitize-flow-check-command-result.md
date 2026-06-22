# Plan 002: Sanitize `/flow-check` command return data

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report -
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 14dc53a..HEAD -- src/extension.ts tests/commands/flow-check.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `14dc53a`, 2026-06-22

## Why this matters

`/flow-check` runs trusted project-configured commands. Those commands can print
tokens, passwords, or other sensitive local output. Codeflow already redacts
rendered summaries and stores bounded check state, but the Pi command handler
currently returns the full check run object, including raw `stdout` and
`stderr`. If Pi records command return values, that bypasses the existing
redaction boundary.

## Current state

- `src/checks/check-runner.ts`: captures raw command output in internal check
  results.
- `src/checks/check-summary.ts`: redacts and truncates summaries.
- `src/state/check-state.ts`: stores bounded check metadata and summaries only.
- `src/extension.ts`: registers Pi commands and returns command handler results.
- `tests/commands/flow-check.test.ts`: tests `/flow-check` registration.

Current excerpts:

```text
src/checks/check-runner.ts:107-119
const result: CodeflowCheckResult = {
  name: check.name,
  command: check.command,
  status,
  exitCode: commandResult.exitCode,
  signal: commandResult.signal,
  startedAt,
  finishedAt,
  durationMs,
  stdout: commandResult.stdout,
  stderr: commandResult.stderr,
  summary: '',
  required: check.required,
};
```

```text
src/extension.ts:274-279
sessionStore.set(context.cwd, result.sessionState);
context.ui.notify(
  formatFlowCheckResult(result),
  result.checkRun.status === 'failed' ? 'warning' : 'info',
);
return result;
```

```text
src/state/check-state.ts:44-57
export function toStoredCheckRun(run: CodeflowCheckRunResult): CodeflowStoredCheckRun {
  return {
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    results: run.results.map((result) => ({
      name: result.name,
      command: truncateForSummary(result.command, MAX_STORED_COMMAND_CHARS),
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      summary: truncateForSummary(result.summary, MAX_STORED_SUMMARY_CHARS),
    })),
  };
}
```

Repo conventions:

- Keep raw check output available inside the check runner unless a test proves it
  is no longer needed.
- Use small pure helpers near the command handler instead of adding a new layer.
- Existing tests use Vitest and direct command registration stubs.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused tests | `npm test -- tests/commands/flow-check.test.ts tests/state/check-state.test.ts tests/checks/check-summary.test.ts` | all selected tests pass |
| Typecheck | `npm run typecheck` | exit 0 |
| Full gate | `npm run check` | exit 0 |

## Scope

**In scope**:

- `src/extension.ts`
- `tests/commands/flow-check.test.ts`
- `plans/README.md`

**Out of scope**:

- Changing how checks execute.
- Removing raw output from `src/checks/check-runner.ts`.
- Changing configured check command syntax.
- Adding dependencies.
- Persisting check logs.

## Git workflow

- Branch: `fix/002-sanitize-flow-check-result`
- Commit style: conventional commit, for example `fix: sanitize flow-check command result`
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a regression test for command return redaction

In `tests/commands/flow-check.test.ts`, add a test in
`describe('/flow-check command registration', ...)` that:

1. registers the extension with a mocked `runFlowCheck`;
2. makes the mocked result include one `checkRun.results` item with
   `stdout: 'TOKEN=super-secret'` and `stderr: 'password=super-secret'`;
3. invokes the registered `flow-check` handler;
4. asserts `JSON.stringify(result)` does not contain `super-secret`;
5. asserts the notification still contains the normal formatted summary.

Use the existing registration test at lines 136-192 as the structural pattern.

**Verify**:

```sh
npm test -- tests/commands/flow-check.test.ts
```

Expected before the fix: the new test fails because the handler returns raw
output. Expected after Step 2: it passes.

### Step 2: Sanitize the command handler return value

In `src/extension.ts`, keep the existing notification and session-store behavior
unchanged, but return a sanitized copy from `handleFlowCheckCommand`.

Minimum acceptable shape:

- preserve `checkRun.status`, timestamps, duration, summary, names arrays,
  lifecycle phase, warnings, next expected actions, and `sessionState`;
- for each `checkRun.results` item, remove raw `stdout` and `stderr`;
- preserve already-redacted `summary`;
- do not mutate the original `result` object before it is stored or formatted.

Keep this helper private to `src/extension.ts`. Do not add a new file.

**Verify**:

```sh
npm test -- tests/commands/flow-check.test.ts
```

Expected: all tests in the file pass.

### Step 3: Confirm stored state and summaries still behave

Run:

```sh
npm test -- tests/state/check-state.test.ts tests/checks/check-summary.test.ts
npm run typecheck
```

Expected: tests pass and typecheck exits 0.

### Step 4: Run the full gate and update plan status

Run:

```sh
npm run check
git diff --check
```

Expected: both commands exit 0.

Update this plan's row in `plans/README.md` from `TODO` to `DONE` only after
the changes and checks pass.

## Test plan

- Add one `/flow-check` command-registration regression test proving raw
  `stdout` and `stderr` are absent from the handler return value.
- Keep existing state and summary tests passing to prove stored state remains
  bounded and formatted output remains redacted.

## Done criteria

- [ ] `/flow-check` Pi command handler return data no longer includes raw
      `stdout` or `stderr`.
- [ ] Formatted notifications still work.
- [ ] Session state still stores bounded check metadata.
- [ ] `npm test -- tests/commands/flow-check.test.ts tests/state/check-state.test.ts tests/checks/check-summary.test.ts` passes.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run check` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- Pi explicitly requires command handler returns to contain raw check output.
- Removing `stdout` or `stderr` from the handler return forces broad public type
  changes outside `src/extension.ts`.
- The in-scope files changed and no longer match the excerpts above.
- A fix requires adding persistence, encryption, or a new dependency.

## Maintenance notes

This plan only narrows the Pi command return surface. The check runner may still
capture raw output internally so summaries can be built. Reviewers should inspect
any future command handler that returns command execution output and ask whether
that value is rendered, persisted, or returned raw.
