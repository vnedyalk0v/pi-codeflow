# Plan 002: Validate base/head branch refs before they reach git and gh

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 554971d..HEAD -- src/pull-requests/pr-policy.ts src/git/git-client.ts src/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security (hardening)
- **Planned at**: commit `554971d`, 2026-06-18

## Why this matters

`/flow-pr` resolves a base branch and a head branch from `--base`/`--head`
command flags and from PR-payload fields, then feeds those values into git and
GitHub CLI invocations (`git fetch`, `git push`, `git ls-remote`,
`gh pr create --base/--head`). The git/gh clients use `execFile` with argv
arrays, so there is **no shell-injection risk** — but there is no validation
that a resolved ref is a well-formed branch name either. A value that looks
like an option (for example, one beginning with `-`) is still interpreted by
git/gh as a flag rather than as a ref, which is option/argument injection into
the underlying tools.

Internally generated branch names are already safe (`renderBranchName` in
`src/branching/branch-name.ts` emits a lowercase ASCII slug). The exposed gap is
narrow: explicit `--base`/`--head` overrides and payload-supplied branch names.
This plan adds one small validation chokepoint so a malformed or option-like ref
is rejected with a clear Codeflow error before it ever reaches git/gh. This is
defense-in-depth consistent with the project's conservative-by-default stance
(`docs/SECURITY_MODEL.md`).

## Current state

### Where untrusted refs resolve (the chokepoint)

`src/pull-requests/pr-policy.ts`, `resolveBaseBranch` (lines 195–219) and
`resolveHeadBranch` (lines 221–236):

```ts
function resolveBaseBranch(options: {
  config: CodeflowConfig;
  explicitBaseBranch?: string;
  payloadBaseBranch?: string;
}): string {
  const baseBranch = (
    options.explicitBaseBranch ??
    options.payloadBaseBranch ??
    options.config.pullRequest.baseBranch ??
    options.config.baseBranches.default
  ).trim();

  if (!options.config.baseBranches.allowed.includes(baseBranch)) {
    throw new CodeflowPrError({
      code: 'base_not_allowed',
      message: `Base branch ${baseBranch} is not listed in Codeflow baseBranches.allowed.`,
      details: { baseBranch, allowed: options.config.baseBranches.allowed },
    });
  }

  return baseBranch;
}

function resolveHeadBranch(options: {
  explicitHeadBranch?: string;
  payloadHeadBranch?: string;
  currentBranch: string | null;
}): string {
  const headBranch = (options.explicitHeadBranch ?? options.payloadHeadBranch ?? options.currentBranch)?.trim();

  if (!headBranch) {
    throw new CodeflowPrError({
      code: 'missing_head_branch',
      message: 'Could not determine the PR head branch; provide --head or run from a named branch.',
    });
  }

  return headBranch;
}
```

`resolveBaseBranch` already constrains the value to an allow-list, so it is
mostly safe; `resolveHeadBranch` accepts any non-empty string. Both are the
single resolution points feeding the downstream git/gh calls
(`src/pull-requests/pr-policy.ts:146-192`).

### Downstream sinks (for context — do NOT add validation here)

- `src/git/git-client.ts:76-88` `fetchBranch` → `git fetch … <branch>:refs/...`
- `src/git/git-client.ts:116-118` `pushBranch` → `git push -u origin <branch>:<branch>`
- `src/git/git-client.ts:58-74` `getRemoteHeadSha` → `git ls-remote … <branch>`
- `src/github/pr-client.ts:92-103` `buildCreatePullRequestArgs` → `gh pr create --base <base> --head <head>`

These all use `execFile` (argv arrays), so the only realistic risk is
option-like refs; validating once at resolution is sufficient and keeps the fix
small.

### Existing error convention

`CodeflowPrError` with a typed `code` (see `src/pull-requests/pr-errors.ts` and
its uses throughout `pr-policy.ts`). The error-code union type
`CodeflowPrErrorCode` is defined in `src/pull-requests/pr-errors.ts` — you will
add one new code there.

### Test convention

`tests/pull-requests/` and `tests/commands/flow-pr.test.ts` use vitest with
injected fake `GitClient`/`GhClient` (see the `gitClient(...)` and `ghClient(...)`
factories at `tests/commands/flow-pr.test.ts:83-107`). A unit test for the
validator itself belongs in a new `tests/git/git-ref.test.ts`.

## Commands you will need

| Purpose       | Command                                              | Expected on success |
|---------------|------------------------------------------------------|---------------------|
| Typecheck     | `npm run typecheck`                                  | exit 0, no errors   |
| Tests (refs)  | `npx vitest run tests/git/git-ref.test.ts`           | all pass            |
| Tests (PR)    | `npx vitest run tests/commands/flow-pr.test.ts`      | all pass            |
| Full check    | `npm run check`                                      | exit 0              |

## Scope

**In scope** (the only files you should modify/create):
- `src/git/git-ref.ts` (create — the validator)
- `src/pull-requests/pr-policy.ts` (call the validator in the two resolve fns)
- `src/pull-requests/pr-errors.ts` (add an `invalid_ref` error code)
- `src/index.ts` (export the validator)
- `tests/git/git-ref.test.ts` (create — unit tests)
- `tests/commands/flow-pr.test.ts` (one test: a malformed `--head` is rejected)

**Out of scope** (do NOT touch):
- `src/git/git-client.ts`, `src/github/pr-client.ts`, `src/github/gh-client.ts`
  — do not add validation inside the clients; validate at the resolution
  chokepoint only.
- `src/branching/branch-name.ts` — already produces safe slugs; leave it.
- `src/commands/flow-commit.ts` and commit policy — `/flow-commit` takes no
  branch-name overrides, so it is not a vector here.

## Git workflow

- Branch: `fix/validate-git-refs` (semantic branch per `AGENTS.md`; from `dev`).
- Conventional Commits, e.g. `fix(pull-requests): reject malformed base/head refs before git`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the ref validator

Create `src/git/git-ref.ts`. It exports `assertValidGitRef(ref: string, label: string): string`
that returns the trimmed ref on success and throws on a malformed value. Reject,
at minimum: empty/whitespace-only; a leading `-` (option-like); any whitespace
or control character; `..` or `@{` sequences; a trailing `/` or `.lock`; and the
literal `@`. Keep it conservative — this guards branch names, which are a narrow
subset of full refspecs.

Throw a plain `Error` subclass local to this module is **not** the convention;
instead, throw a generic `Error` here and let the caller wrap it — OR (preferred,
to keep the caller simple) accept an `onInvalid` callback. To avoid a circular
import between `git-ref.ts` and `pr-errors.ts`, implement the validator as a
**pure predicate plus a thrower that takes a message-building callback**:

```ts
export interface GitRefValidationOptions {
  // Called with a human-readable reason when the ref is invalid.
  // The caller supplies the error to throw (keeps this module dependency-free).
  onInvalid: (reason: string) => never;
}

export function assertValidGitRef(
  ref: string,
  label: string,
  options: GitRefValidationOptions,
): string {
  const value = ref.trim();
  const reason = getGitRefRejectionReason(value);

  if (reason) {
    options.onInvalid(`${label} "${ref}" is not a valid git branch name: ${reason}`);
  }

  return value;
}

export function getGitRefRejectionReason(value: string): string | null {
  if (value.length === 0) return 'it is empty';
  if (value.startsWith('-')) return 'it must not start with "-"';
  if (/\s/.test(value)) return 'it must not contain whitespace';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(value)) return 'it must not contain control characters';
  if (value.includes('..')) return 'it must not contain ".."';
  if (value.includes('@{')) return 'it must not contain "@{"';
  if (value.includes('~') || value.includes('^') || value.includes(':') || value.includes('?') || value.includes('*') || value.includes('[') || value.includes('\\')) {
    return 'it must not contain git refspec metacharacters';
  }
  if (value === '@') return 'it must not be "@"';
  if (value.endsWith('/') || value.endsWith('.lock')) return 'it has an invalid suffix';
  return null;
}
```

(The `onInvalid` callback returns `never`, so TypeScript narrows correctly after
the call. There is no `eslint` in this repo, so the disable comment is harmless
but optional — remove it if you prefer.)

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Add the `invalid_ref` error code

In `src/pull-requests/pr-errors.ts`, add `'invalid_ref'` to the
`CodeflowPrErrorCode` union. Make no other change to that file.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Call the validator at both resolution points

In `src/pull-requests/pr-policy.ts`, import the validator
(`import { assertValidGitRef } from '../git/git-ref';`) and apply it to the
resolved value in both `resolveBaseBranch` and `resolveHeadBranch`, throwing a
`CodeflowPrError` with `code: 'invalid_ref'` via the `onInvalid` callback.

For `resolveBaseBranch`, validate after the trim and **before** the allow-list
check, so a malformed value gets the precise `invalid_ref` message. For
`resolveHeadBranch`, validate after the non-empty check. Example for the head
resolver:

```ts
  return assertValidGitRef(headBranch, 'PR head branch', {
    onInvalid: (reason) => {
      throw new CodeflowPrError({ code: 'invalid_ref', message: reason });
    },
  });
```

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Export the validator from the package index

In `src/index.ts`, add `export { assertValidGitRef, getGitRefRejectionReason } from './git/git-ref';`
near the other `./git`/`./safety` exports (around line 17). This keeps the public
surface consistent with how other helpers (`isReservedBranch`) are exported.

**Verify**: `npm run typecheck` → exit 0.

### Step 5: Write tests

Create `tests/git/git-ref.test.ts` (model the plain-unit style of
`tests/safety/reserved-branch-policy.test.ts`). Cover:
- valid names pass and are returned trimmed: `feat/x`, `fix/BILL-142-thing`,
  `release-1.2`.
- each rejection reason fires: ``, `-foo`, `feat/ x`, `a..b`, `a@{0}`,
  `a:b`, `head/`, `head.lock`.
- `assertValidGitRef` invokes `onInvalid` (use a spy that throws) for invalid
  input and does not for valid input.

In `tests/commands/flow-pr.test.ts`, add one test inside `describe('runFlowPr', …)`:
calling `runFlowPr` with `payload(...)` and an explicit malformed head
(`headBranch: '--upload-pack=x'`) and `dryRun: true` rejects with
`{ code: 'invalid_ref' }`. Reuse the existing `payload(...)`, `gitClient(...)`,
`state(...)` helpers in that file.

**Verify**: `npx vitest run tests/git/git-ref.test.ts tests/commands/flow-pr.test.ts`
→ all pass.

### Step 6: Run the full check suite

**Verify**: `npm run check` → exit 0.

## Test plan

- New `tests/git/git-ref.test.ts`: happy paths, one case per rejection reason,
  and `onInvalid` callback behavior.
- New case in `tests/commands/flow-pr.test.ts`: malformed `--head` override is
  rejected with `invalid_ref` (the regression this plan fixes), proving the
  validator is wired into the real resolution path.
- Structural patterns: `tests/safety/reserved-branch-policy.test.ts` for the
  pure unit test; the existing `runFlowPr` tests for the integration case.
- Verification: `npm run check` → exit 0; the new tests pass.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npx vitest run tests/git/git-ref.test.ts tests/commands/flow-pr.test.ts` passes
- [ ] `npm run check` exits 0
- [ ] `grep -n "assertValidGitRef" src/pull-requests/pr-policy.ts` returns matches
      (validator is wired into both resolvers)
- [ ] `git status` shows only the in-scope files added/modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `resolveBaseBranch`/`resolveHeadBranch` in `pr-policy.ts` no longer match the
  "Current state" excerpts (drift since 554971d).
- Adding the validator breaks an existing `flow-pr` test because a legitimate
  branch name used in fixtures is now rejected — re-read the rejection rules
  against that name and report which rule is too strict rather than weakening it
  silently.
- You find a second untrusted ref entry point outside `pr-policy.ts` (e.g. a new
  command added since this plan) — report it; do not expand scope without noting it.

## Maintenance notes

- If `/flow-commit` or a future command ever accepts branch-name overrides, route
  them through `assertValidGitRef` at their resolution point too.
- The rule set is intentionally branch-name-strict, not full-refspec-permissive.
  If a legitimate workflow needs slashes-with-dots or other characters, widen
  `getGitRefRejectionReason` deliberately with a test, not by deleting a rule.
- Reviewer focus: confirm validation happens before any value reaches a
  `GitClient`/`GhClient` method, and that the allow-list check in
  `resolveBaseBranch` still runs.
