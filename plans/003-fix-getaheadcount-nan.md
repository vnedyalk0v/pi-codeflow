# Plan 003: Stop `getAheadCount` from returning NaN and silently skipping the "no commits ahead" PR warning

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 554971d..HEAD -- src/git/git-client.ts src/pull-requests/pr-policy.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (correctness)
- **Planned at**: commit `554971d`, 2026-06-18

## Why this matters

`/flow-pr` warns when the PR head has no commits ahead of its base, so an agent
doesn't open an empty PR. That warning depends on `GitClient.getAheadCount`,
which parses `git rev-list --count` output with `Number.parseInt` and **no NaN
guard**. If git emits empty/unexpected output (a transient failure, an odd ref
state), `getAheadCount` returns `NaN`; the caller only special-cases `=== 0`, so
`NaN` slips through and the "no commits ahead" warning is silently suppressed —
the exact case the warning exists to catch. This is a small correctness fix with
a clean test story; it's a good low-risk task.

## Current state

`src/git/git-client.ts:111-114`:

```ts
  async getAheadCount(baseRef: string, headRef = 'HEAD'): Promise<number> {
    const result = await this.run(['rev-list', '--count', `${baseRef}..${headRef}`]);
    return Number.parseInt(result.stdout.trim(), 10);
  }
```

Caller — `src/pull-requests/pr-policy.ts:456-473` (inside `collectAheadWarnings`):

```ts
  try {
    const aheadCount = await options.gitClient.getAheadCount(baseRef, headRef);

    if (aheadCount === 0) {
      options.warnings.push(
        `PR head ${options.headBranch} has no commits ahead of ${baseRef}; confirm the PR has intended changes.`,
      );
    }
  } catch (error) {
    if (error instanceof GitError) {
      options.warnings.push(
        `Could not compare PR head ${options.headBranch} (${headRef}) against ${baseRef}; confirm the PR contains intended commits.`,
      );
      return;
    }

    throw error;
  }
```

When `getAheadCount` returns `NaN`, `aheadCount === 0` is `false`, so neither the
"no commits ahead" warning nor the catch-block warning fires — the comparison is
silently lost.

### Convention notes

- `GitClient` methods throw `GitError` on failure (see the private `run` at
  `src/git/git-client.ts:146-164` and `toGitError`). Adding a thrown `GitError`
  for unparseable output is consistent: the caller already converts `GitError`
  into the "Could not compare …" warning.
- The `GitError` constructor takes `{ code, message, command, args, ... }` — see
  `src/git/git-errors.ts` for the exact shape and the existing `'git_command_failed'`
  code. Reuse an existing code; do not invent a new one unless one clearly fits.

## Commands you will need

| Purpose      | Command                                            | Expected on success |
|--------------|----------------------------------------------------|---------------------|
| Typecheck    | `npm run typecheck`                                | exit 0, no errors   |
| Tests (git)  | `npx vitest run tests/git/git-client.test.ts`      | all pass            |
| Tests (PR)   | `npx vitest run tests/commands/flow-pr.test.ts`    | all pass            |
| Full check   | `npm run check`                                    | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/git/git-client.ts` (NaN guard in `getAheadCount`)
- `tests/git/git-client.test.ts` (new test for the guard)
- `tests/commands/flow-pr.test.ts` (optional: assert the warning fires when ahead
  count is 0 — only if not already covered)

**Out of scope** (do NOT touch):
- `src/pull-requests/pr-policy.ts` — the caller's `=== 0` check is correct once
  `getAheadCount` can no longer return `NaN`; do not change the caller logic. (You
  may read it to confirm behavior.)
- Any other `GitClient` method.

## Git workflow

- Branch: `fix/getaheadcount-nan-guard` (semantic branch per `AGENTS.md`; from `dev`).
- Conventional Commits, e.g. `fix(git): throw on unparseable rev-list count instead of returning NaN`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Guard the parse in `getAheadCount`

In `src/git/git-client.ts`, make `getAheadCount` throw a `GitError` when the
output does not parse to a finite number, instead of returning `NaN`:

```ts
  async getAheadCount(baseRef: string, headRef = 'HEAD'): Promise<number> {
    const result = await this.run(['rev-list', '--count', `${baseRef}..${headRef}`]);
    const raw = result.stdout.trim();
    const count = Number.parseInt(raw, 10);

    if (!Number.isInteger(count) || count < 0) {
      throw new GitError({
        code: 'git_command_failed',
        message: `git rev-list --count returned unexpected output: "${raw}"`,
        command: 'git',
        args: ['rev-list', '--count', `${baseRef}..${headRef}`],
      });
    }

    return count;
  }
```

`GitError` is already imported at the top of `src/git/git-client.ts` (line 4:
`import { GitError } from './git-errors';`). Confirm the `GitError` constructor
accepts the fields above by reading `src/git/git-errors.ts`; if `command`/`args`
are required and shaped differently, match that shape exactly. Do not add new
required fields.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Test the guard

In `tests/git/git-client.test.ts`, add a test that exercises `getAheadCount`
returning a real count on a real temp repo (model on the existing tests there,
which use `makeRepo` and real git). At minimum:
- On a fresh repo with one branch, `getAheadCount('HEAD', 'HEAD')` resolves to `0`.
- Create a second commit on a feature branch and assert the count is `> 0` between
  base and head.

For the NaN/throw path, the cleanest unit test is to drive the parse logic
directly: since `run` is private, test via a small repo where `rev-list` succeeds
(covers the happy path), and separately assert the throw by calling
`getAheadCount` with two refs where git errors (e.g. a nonexistent ref) — confirm
it rejects (the existing `run` already throws `GitError` on a git failure, which
is acceptable coverage of the "does not return NaN" contract). If you can
construct an input where git returns empty stdout with exit 0, assert it rejects;
otherwise the nonexistent-ref rejection plus the happy-path count is sufficient.

**Verify**: `npx vitest run tests/git/git-client.test.ts` → all pass, including
the new test(s).

### Step 3: Confirm the caller still behaves

Confirm `tests/commands/flow-pr.test.ts` still passes unchanged (the fake
`gitClient` in that file returns `getAheadCount: async () => 1`, so the happy
path is unaffected). If there is no existing test asserting the "no commits
ahead" warning fires when count is `0`, add one: pass a `gitClient` override with
`getAheadCount: async () => 0` and `dryRun: true`, then assert
`result.warnings.join('\n')` contains `has no commits ahead`.

**Verify**: `npx vitest run tests/commands/flow-pr.test.ts` → all pass.

### Step 4: Full check suite

**Verify**: `npm run check` → exit 0.

## Test plan

- `tests/git/git-client.test.ts`: happy-path ahead count on a real repo; a
  reject path proving `getAheadCount` never returns a non-integer.
- `tests/commands/flow-pr.test.ts`: (if not already present) the "no commits
  ahead" warning fires when `getAheadCount` resolves `0` — the behavior this fix
  protects.
- Structural pattern: existing real-git tests in `tests/git/git-client.test.ts`;
  fake-client tests in `tests/commands/flow-pr.test.ts`.
- Verification: `npm run check` → exit 0.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npx vitest run tests/git/git-client.test.ts tests/commands/flow-pr.test.ts` passes
- [ ] `npm run check` exits 0
- [ ] `grep -n "Number.isInteger" src/git/git-client.ts` returns a match
      (the guard exists)
- [ ] `git status` shows only the in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `getAheadCount` no longer matches the "Current state" excerpt (drift since 554971d).
- The `GitError` constructor signature differs from what Step 1 assumes and the
  correct shape is non-obvious — report the actual signature from `git-errors.ts`.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- If `getAheadCount` ever needs to represent "unknown" rather than throw, return
  `null` and update the caller's `=== 0` check accordingly — but do not return
  `NaN`.
- Reviewer focus: confirm the caller in `pr-policy.ts` is unchanged and that the
  thrown `GitError` is still caught and converted to the "Could not compare …"
  warning (so a real git failure degrades to a warning, not an unhandled throw).
