# Branching

AI agents must use semantic branch names and must not work directly on reserved
branches during normal development.

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

## Slug format

- Use lowercase kebab-case words.
- Ticket IDs may appear before the slug and may keep their uppercase prefix.
- Use ASCII letters, numbers, and hyphens.
- Avoid repeated separators.
- Maximum recommended slug length: 60 characters after the prefix.
- Prefer human-readable nouns and verbs over hashes.

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

## Collision handling

When the desired branch already exists:

1. Check whether the existing branch is the active task branch.
2. If it is unrelated, append a short incrementing suffix such as `-2`.
3. If collision remains ambiguous, stop and ask for human guidance.

Example:

```text
feat/BILL-142-webhook-signatures
feat/BILL-142-webhook-signatures-2
```

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

## Base branch selection

Default policy:

1. Use the configured `baseBranches.default`, normally `dev`.
2. Ensure the base branch exists locally or remotely.
3. If the default branch is missing and config allows fallback, use the configured
   fallback and report it.
4. If fallback is not allowed, stop in `blocked`.

Do not silently branch from `main` when `dev` was required.

## Emergency hotfix behavior

The default emergency path is still branch-based:

```text
hotfix/<ticket-or-slug>
```

Direct work on reserved branches is outside normal scope. An emergency override
requires an explicit reason, structured commits and PRs, verification, a final
report, and follow-up notes for backporting or cherry-picking to `dev`.

## Why `ai/` is not the default prefix

`ai/` describes who performed the work, not what kind of change the branch
contains. Branch prefixes should communicate review and release intent. A
feature implemented by an AI agent is still `feat/`, a bug fix is still `fix/`,
and documentation is still `docs/`.
