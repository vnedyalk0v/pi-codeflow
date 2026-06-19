# Plan 001: Make every `safety.*` config flag either enforced or honestly documented as inert

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 554971d..HEAD -- src/commands/flow-start.ts src/config/codeflow-config.ts src/guidance/build-guidance.ts schemas/codeflow.schema.json docs/CONFIGURATION.md docs/SECURITY_MODEL.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug (correctness and safety/trust)
- **Planned at**: commit `554971d`, 2026-06-18

## Why this matters

pi-codeflow's entire value proposition is to "keep safety rules visible,
auditable, and conservative by default" (`README.md`). The `safety` config
block is schema-validated, set in `config/default.codeflow.json`, repeated in
all four example configs, typed in `src/config/codeflow-config.ts`, and
documented in `docs/CONFIGURATION.md` as live "Fallback safety boundaries" with
**no disclaimer that any of it is unimplemented**. But the engine ignores most
of it:

- `requireCleanWorkingTreeForStart` — `/flow-start` blocks a dirty working tree
  *unconditionally*; setting the flag to `false` does nothing.
- `redactSecretsFromReports` — secret redaction is always on; the flag is read
  nowhere.
- `blockDirectWorkOnReservedBranches` — read only to toggle one guidance
  *warning string*; reserved-branch enforcement is hardcoded and ignores it.
- `allowDirectPushToRemote`, `allowDestructiveGitOperations`, `allowForcePush` —
  read nowhere (the features they would gate do not exist yet).

An operator who believes they configured a safety control that silently does
nothing is the worst failure mode for a safety tool. This plan makes the
config surface honest in one of two ways per flag:

1. **Implement the toggle** where honoring it is safe and the semantics are
   clear: `requireCleanWorkingTreeForStart`.
2. **Document the flag as always-on or reserved** where adding a "disable" path
   would *reduce* safety (disabling secret redaction, disabling reserved-branch
   protection) or where it gates an unbuilt feature. Per `docs/SECURITY_MODEL.md`
   ("avoid storing sensitive data", "destructive operations are disabled by
   default"), these must not become user-disablable now — so the honest fix is
   to say so, not to build a footgun.

After this lands, no `safety.*` flag silently contradicts shipped behavior.

## Current state

### Flag 1 — `requireCleanWorkingTreeForStart` (IMPLEMENT the toggle)

`src/commands/flow-start.ts`, function `prepareCodeflowBranch`, lines 187–198 —
the dirty-tree check is unconditional:

```ts
  const status = await gitClient.getStatus();

  if (!status.clean) {
    throw new FlowStartError({
      code: 'dirty_working_tree',
      message:
        'Working tree has uncommitted changes. Commit, stash, or revert them before running /flow-start; Codeflow will not discard or auto-stash changes.',
      details: {
        entries: status.entries,
      },
    });
  }
```

`prepareCodeflowBranch` already receives the full resolved config as
`options.config` (see its signature `PrepareCodeflowBranchOptions` at lines
71–77 and the call site at lines 137–143 inside `runFlowStart`). The flag is
typed at `src/config/codeflow-config.ts:127-134`:

```ts
export interface CodeflowSafetyConfig {
  blockDirectWorkOnReservedBranches: boolean;
  allowDestructiveGitOperations: boolean;
  allowForcePush: boolean;
  allowDirectPushToRemote: boolean;
  requireCleanWorkingTreeForStart: boolean;
  redactSecretsFromReports: boolean;
}
```

So `options.config.safety.requireCleanWorkingTreeForStart` is reachable with no
signature changes.

### Flag 2 — `redactSecretsFromReports` (DOCUMENT as always-on)

Redaction is unconditional in `src/checks/check-summary.ts:110`
(`truncateForSummary` always calls `redactSecrets(stripAnsi(value))`) and in
`src/pull-requests/pr-body-renderer.ts:39,64`. There is no code path that reads
`config.safety.redactSecretsFromReports`. Disabling redaction would contradict
`docs/SECURITY_MODEL.md` ("avoid storing sensitive data in rendered reports …
redact likely tokens"). Resolution: keep redaction always-on; document the flag
as reserved/non-disablable. **No code change to redaction in this plan.**

### Flag 3 — `blockDirectWorkOnReservedBranches` (DOCUMENT current behavior)

Read only at `src/guidance/build-guidance.ts:181-189`, where it gates whether a
warning line is added to the guidance message:

```ts
  if (
    context.currentBranch &&
    config.reservedBranches.includes(context.currentBranch) &&
    config.safety.blockDirectWorkOnReservedBranches
  ) {
    warnings.push(
      `Current branch ${context.currentBranch} is reserved; avoid normal workflow changes here.`,
    );
  }
```

Actual reserved-branch enforcement (`src/safety/workflow-safety.ts`,
`src/commands/flow-start.ts:177-185`, `src/pull-requests/pr-policy.ts:293-319`)
hardcodes `isReservedBranch` checks and does **not** consult this flag.
Loosening reserved-branch protection via config would reduce safety, so this
plan does **not** change enforcement code. Resolution: document that
reserved-branch protection is always enforced and this flag currently only
affects guidance messaging.

### Flags 4–6 — `allowDirectPushToRemote`, `allowDestructiveGitOperations`, `allowForcePush` (DOCUMENT as reserved)

Read nowhere in `src/`. Destructive git operations and force-push are not
implemented (`docs/SECURITY_MODEL.md` lists them as disabled by default), and
feature-branch pushing is gated on `pullRequest.pushBeforeCreate`/`--push`
(`src/pull-requests/pr-policy.ts:676-678`), not on `allowDirectPushToRemote`.
Resolution: document these three as reserved for a future milestone.

### Default config and docs (the source of the false promise)

`config/default.codeflow.json:149-156`:

```json
  "safety": {
    "blockDirectWorkOnReservedBranches": true,
    "allowDestructiveGitOperations": false,
    "allowForcePush": false,
    "allowDirectPushToRemote": false,
    "requireCleanWorkingTreeForStart": true,
    "redactSecretsFromReports": true
  }
```

`schemas/codeflow.schema.json` — the `safety` object's properties are each bare
`{ "type": "boolean" }` (around lines 575–610), with no `description`.

`docs/CONFIGURATION.md:184` describes `safety` only as "Fallback safety
boundaries." and shows the same block at lines 498–505 with no per-flag prose.
The doc *does* disclaim other reserved features (`extends` at line 75,
command-specific overrides at line 24) — follow that same disclaiming style.

### Repo conventions to match

- **Errors**: throw the existing `FlowStartError` with a typed `code`; do not
  invent new error shapes. See `src/commands/flow-start.ts:42-69`.
- **Config is threaded explicitly**, never read from a global. Use
  `options.config.safety.*`.
- **Tests**: vitest, real temp git repos for `/flow-start`. Model new tests on
  the existing patterns in `tests/commands/flow-start.test.ts` (helpers
  `makeRepo`, `currentBranch`, and the `mergeCodeflowConfig(getDefaultCodeflowConfig(), …)`
  pattern used in `tests/commands/flow-pr.test.ts:189-193`).
- **Docs-first rule** (`AGENTS.md`): behavior changes must update docs and
  schemas in the same change. This plan does that by design.

## Commands you will need

| Purpose          | Command                                             | Expected on success            |
|------------------|-----------------------------------------------------|--------------------------------|
| Typecheck        | `npm run typecheck`                                 | exit 0, no errors              |
| Tests (file)     | `npx vitest run tests/commands/flow-start.test.ts`  | all pass                       |
| JSON check       | `node scripts/check-json.mjs`                       | exit 0                         |
| Docs check       | `node scripts/check-docs-format.mjs`               | exit 0                         |
| Full check suite | `npm run check`                                     | exit 0 (json+text+docs+tsc+test) |

## Scope

**In scope** (the only files you should modify):
- `src/commands/flow-start.ts` (Flag 1 enforcement)
- `tests/commands/flow-start.test.ts` (new tests for Flag 1)
- `schemas/codeflow.schema.json` (add `description` to each `safety` property)
- `docs/CONFIGURATION.md` (per-flag prose and disclaimers)

**Out of scope** (do NOT touch, even though they look related):
- `src/checks/check-summary.ts`, `src/pull-requests/pr-body-renderer.ts` — do
  NOT add a way to disable redaction. Redaction stays always-on by design.
- `src/safety/workflow-safety.ts`, `src/pull-requests/pr-policy.ts`,
  `src/guidance/build-guidance.ts` — do NOT change reserved-branch enforcement.
- `config/default.codeflow.json` and the `config/example.*.json` files — the
  default values are correct; only the schema descriptions and docs change.
- `src/config/codeflow-config.ts` — the type already lists all six flags; no
  change needed.

## Git workflow

- Branch: `fix/enforce-safety-config-flags` (semantic branch per `AGENTS.md`;
  branch from `dev`).
- Conventional Commits (see `git log --oneline`): e.g.
  `fix(flow-start): honor requireCleanWorkingTreeForStart safety flag`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Honor `requireCleanWorkingTreeForStart` in `/flow-start`

In `src/commands/flow-start.ts`, inside `prepareCodeflowBranch`, gate the
dirty-tree block on the flag. Replace the unconditional check (lines 187–198)
with a version that only enforces when the flag is enabled, and otherwise
records a warning so the loosened behavior is still visible:

```ts
  const status = await gitClient.getStatus();

  if (!status.clean) {
    if (options.config.safety.requireCleanWorkingTreeForStart) {
      throw new FlowStartError({
        code: 'dirty_working_tree',
        message:
          'Working tree has uncommitted changes. Commit, stash, or revert them before running /flow-start; Codeflow will not discard or auto-stash changes.',
        details: {
          entries: status.entries,
        },
      });
    }

    warnings.push(
      'Working tree has uncommitted changes; starting anyway because safety.requireCleanWorkingTreeForStart is disabled. Uncommitted changes are not moved to the new branch by Codeflow.',
    );
  }
```

Note: `prepareCodeflowBranch` already declares `const warnings: string[] = [];`
at line 174 and returns it, so `warnings.push(...)` is in scope here. Do not add
a new array.

**Verify**: `npm run typecheck` → exit 0, no errors.

### Step 2: Add tests for both branches of Flag 1

In `tests/commands/flow-start.test.ts`, add two tests inside the existing
`describe('runFlowStart', …)` block. Use the existing `makeRepo` helper, then
make the tree dirty by writing to a tracked file after the initial commit
(mirror `tests/git/git-client.test.ts:38-47`, which dirties `README.md`).

- Test A (default, flag on): after `makeRepo()`, write changed content to
  `README.md`, then call `runFlowStart` with `config: getDefaultCodeflowConfig()`
  and expect it to reject with `{ code: 'dirty_working_tree' }`.
- Test B (flag off): same dirty setup, but pass a config built with
  `mergeCodeflowConfig(getDefaultCodeflowConfig(), { safety: { requireCleanWorkingTreeForStart: false } } as Record<string, unknown>)`
  and `dryRun: true`; expect it to resolve and `result.warnings.join('\n')` to
  contain `safety.requireCleanWorkingTreeForStart is disabled`.

`mergeCodeflowConfig` and `getDefaultCodeflowConfig` are already imported in the
flow-pr test; add them to the imports in this file from `'../../src/index'` if
not already present (the file currently imports `getDefaultCodeflowConfig` and
`mergeCodeflowConfig` — confirm and reuse).

**Verify**: `npx vitest run tests/commands/flow-start.test.ts` → all pass,
including the 2 new tests.

### Step 3: Document each flag in the schema

In `schemas/codeflow.schema.json`, add a `"description"` to each of the six
`safety` properties. Target shape (keep `"type": "boolean"`, add `description`):

- `blockDirectWorkOnReservedBranches`: "When true, Codeflow surfaces a guidance
  warning on reserved branches. Reserved-branch protection is always enforced
  regardless of this flag."
- `allowDestructiveGitOperations`: "Reserved for a future milestone. Destructive
  git operations are not implemented; this flag currently has no effect."
- `allowForcePush`: "Reserved for a future milestone. Force-push is not
  implemented; this flag currently has no effect."
- `allowDirectPushToRemote`: "Reserved for a future milestone. Feature-branch
  pushes are gated by pullRequest.pushBeforeCreate; this flag currently has no
  effect."
- `requireCleanWorkingTreeForStart`: "When true, /flow-start refuses to run with
  a dirty working tree. When false, /flow-start proceeds and warns instead."
- `redactSecretsFromReports`: "Secret redaction is always applied to summaries,
  reports, and PR bodies and cannot be disabled. This flag is reserved and
  currently has no effect."

**Verify**: `node scripts/check-json.mjs` → exit 0.

### Step 4: Document the flags in `docs/CONFIGURATION.md`

Add a short bulleted subsection near the `safety` block (the table row at line
184 and the example at lines 498–505) describing each flag, matching the
disclaiming style used for `extends` (line 75) and command overrides (line 24).
The prose must state plainly: `requireCleanWorkingTreeForStart` is enforced and
toggleable; `redactSecretsFromReports` is always-on and reserved;
`blockDirectWorkOnReservedBranches` only affects guidance messaging (enforcement
is unconditional); `allowDestructiveGitOperations`, `allowForcePush`, and
`allowDirectPushToRemote` are reserved for future milestones and currently have
no effect.

**Verify**: `node scripts/check-docs-format.mjs` → exit 0.

### Step 5: Run the full check suite

**Verify**: `npm run check` → exit 0 (runs check:json, check:text, check:docs,
typecheck, and the full vitest suite).

## Test plan

- New tests in `tests/commands/flow-start.test.ts`:
  - dirty tree with default config → rejects with `dirty_working_tree` (regression
    guard: the flag defaults to true, so existing behavior is preserved).
  - dirty tree with `requireCleanWorkingTreeForStart: false` → resolves with a
    warning containing `safety.requireCleanWorkingTreeForStart is disabled`.
- Structural pattern to follow: existing `runFlowStart` tests in the same file
  (`makeRepo`, real temp repo) plus the `mergeCodeflowConfig(...)` override
  pattern from `tests/commands/flow-pr.test.ts:189-193`.
- Verification: `npx vitest run tests/commands/flow-start.test.ts` → all pass,
  including 2 new tests; then `npm run check` → exit 0.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npx vitest run tests/commands/flow-start.test.ts` passes, including the 2
      new tests
- [ ] `npm run check` exits 0
- [ ] `grep -n "requireCleanWorkingTreeForStart" src/commands/flow-start.ts`
      returns a match (the flag is now read in code)
- [ ] Every `safety` property in `schemas/codeflow.schema.json` has a
      `"description"`
- [ ] `docs/CONFIGURATION.md` documents all six flags with the dispositions
      above
- [ ] `git status` shows only the four in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The dirty-tree block in `flow-start.ts` no longer matches the "Current state"
  excerpt (the file drifted since 554971d).
- `prepareCodeflowBranch` no longer receives `options.config` (signature
  changed) — the flag would not be reachable without a wider refactor.
- You find yourself wanting to add a code path that disables secret redaction or
  loosens reserved-branch enforcement — that is explicitly out of scope; stop
  and report.
- A verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- If a future milestone implements destructive ops, force-push, or
  direct-to-remote pushing, the corresponding flags must be wired into those new
  code paths and their schema/docs descriptions updated from "reserved" to
  "enforced".
- If reserved-branch enforcement is ever made config-disablable, revisit the
  `blockDirectWorkOnReservedBranches` description — but treat that as a security
  decision requiring maintainer sign-off, not a routine change.
- Reviewer focus: confirm no path was added to disable redaction; confirm the
  default config behavior (flag true) is unchanged so existing repos see no
  difference.
- Deferred deliberately: actually consuming `redactSecretsFromReports` as a
  toggle. Disabling secret redaction is a footgun and is intentionally not built.
