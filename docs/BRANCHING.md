# Branching

AI agents must use semantic branch names and must not work directly on reserved
branches during normal development.

## Implementation status

The v0.4 foundation implements `/flow-start` for safe semantic branch
preparation. It can classify or validate the task type, render a branch name,
select the configured base branch, reject dirty working trees, and create or
switch to the semantic work branch. It does not commit, push, open PRs, run
checks, or automate review comments.

## `/flow-start` examples

```text
/flow-start --type feat "Add Google OAuth login"
/flow-start --ticket BILL-142 --type feat "Add Stripe webhook verification"
/flow-start "Fix checkout timeout"
/flow-start --emergency "Checkout is down in production"
/flow-start --dry-run --type docs "Document config loading"
```

A successful run returns the task, type, ticket when available, base branch,
work branch, lifecycle phase `branch_prepared`, and next expected actions.

## Branch type policy

| Prefix | Use when | Example with ticket | Example without ticket |
| --- | --- | --- | --- |
| `feat/` | Adding user-visible behavior. | `feat/BILL-142-webhook-signatures` | `feat/webhook-signatures` |
| `fix/` | Fixing incorrect behavior. | `fix/AUTH-22-token-refresh` | `fix/token-refresh` |
| `hotfix/` | Urgent production fix. | `hotfix/INC-7-disable-broken-job` | `hotfix/disable-broken-job` |
| `refactor/` | Restructuring without behavior change. | `refactor/API-31-route-modules` | `refactor/route-modules` |
| `perf/` | Improving performance. | `perf/WEB-88-cache-feed` | `perf/cache-feed` |
| `docs/` | Documentation-only change. | `docs/DOC-12-install-guide` | `docs/install-guide` |
| `test/` | Test-only or test-focused change. | `test/PAY-9-webhook-fixtures` | `test/webhook-fixtures` |
| `chore/` | Maintenance with no product behavior change. | `chore/OPS-3-update-labels` | `chore/update-labels` |
| `ci/` | CI or automation change. | `ci/CI-14-node-matrix` | `ci/node-matrix` |
| `build/` | Build system or packaging change. | `build/PKG-4-bundle-config` | `build/bundle-config` |
| `revert/` | Reverting a previous change. | `revert/PR-51-webhook-signatures` | `revert/webhook-signatures` |

Explicit `/flow-start --type <type>` values must appear in
`config.branching.allowedTypes`. Unsupported explicit types fail with a clear
error and are not rewritten.

When `--type` is omitted, `/flow-start` uses deterministic inference only. It
recognizes strong task cues for `fix`, `hotfix`, `docs`, `test`, `refactor`,
`perf`, `ci`, `build`, and `chore`; otherwise it defaults to `feat`.

## Slug format

- Use lowercase kebab-case words.
- Ticket IDs may appear before the slug and may keep their uppercase prefix.
- Use ASCII letters, numbers, and hyphens.
- Avoid repeated separators.
- Maximum recommended slug length: 60 characters after the prefix.
- Prefer human-readable nouns and verbs over hashes.
- `/flow-start` removes unsupported characters, collapses repeated separators,
  trims leading and trailing hyphens, and respects
  `branching.slug.maxLength`.

Good examples:

```text
feat/BILL-142-webhook-signatures
fix/token-refresh
chore/update-issue-templates
docs/v0-1-spec-hardening
```

Bad examples:

```text
ai/fix-stuff
feat/this_is_not_kebab_case
fix/misc
main
```

If the task does not contain enough useful text to render a branch slug,
`/flow-start` stops and asks for a more specific task description.

## Ticket detection

`/flow-start` accepts explicit tickets with `--ticket BILL-142` and can detect a
first ticket in the task from `config.branching.ticketPattern`. The default
pattern recognizes uppercase project keys followed by a number, such as
`BILL-142` or `PROJ-9`.

## Collision handling

When the desired branch already exists, the v0.4 implementation appends the
configured numeric collision suffix when `branching.slug.collisionSuffix` is
`increment`:

```text
feat/add-google-oauth-login
feat/add-google-oauth-login-2
feat/add-google-oauth-login-3
```

If collision handling is configured as `block`, Codeflow stops. The `short-sha`
policy is reserved for later work and is not implemented by `/flow-start` yet.

## Reserved branches

Codeflow-reserved branches include at least:

- `main`
- `master`
- `dev`
- `develop`
- `stage`
- `staging`
- `release`
- `production`

A **GitHub-protected branch** is a branch whose rules are enforced by GitHub
settings.

A **Codeflow-reserved branch** is a branch where AI normal work is not allowed,
regardless of whether GitHub protection is configured.

AI agents must not work directly on reserved branches even when they are not
GitHub-protected because:

- local repositories may not mirror remote protection settings;
- unprotected branches can still be release-critical;
- direct commits bypass review, checks, and final reporting;
- consistent workflow matters more than platform-specific enforcement.

`/flow-start` may be invoked while currently on a reserved branch such as `dev`,
but it must create or switch to a non-reserved semantic work branch before normal
implementation continues.

## Base branch selection

Default policy:

1. Use the configured `baseBranches.default`, normally `dev`.
2. Fetch the base branch when possible.
3. Prefer `origin/<baseBranch>` when available.
4. Fall back to local `<baseBranch>` when the remote ref is unavailable.
5. If the default branch is missing and config allows fallback, use the
   configured fallback and report it.
6. If fallback is not allowed or is unavailable, stop in `blocked`.

Do not silently branch from `main` when `dev` was required.

## Working tree behavior

Before creating or switching branches, `/flow-start` inspects `git status`.

- Clean tree: proceed.
- Dirty tree: stop with a clear error asking the user to commit, stash, or
  revert the changes.
- Codeflow does not run `git reset --hard`, force checkout, force push, or
  auto-stash changes in this foundation.

## Emergency hotfix behavior

The default emergency path is still branch-based:

```text
hotfix/<ticket-or-slug>
```

Direct work on reserved branches is outside normal scope. An emergency override
requires an explicit reason, structured commits and PRs, verification, a final
report, and follow-up notes for backporting or cherry-picking to `dev` when those
later commands are implemented.

## Why `ai/` is not the default prefix

`ai/` describes who performed the work, not what kind of change the branch
contains. Branch prefixes should communicate review and release intent. A
feature implemented by an AI agent is still `feat/`, a bug fix is still `fix/`,
and documentation is still `docs/`.
