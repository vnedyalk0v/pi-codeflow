# Plan 001: Align promotion merge policy with repository settings

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report -
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 14dc53a..HEAD -- AGENTS.md docs/RELEASE_PROCESS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live files before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `14dc53a`, 2026-06-22

## Why this matters

The repository documentation tells agents to use merge commits for `dev` to
`main` promotion PRs, but live GitHub settings disallow merge commits. That
means agents following the docs hit a GitHub error and then need fallback sync
work. The fix is to make the documented workflow match the repository setting
that actually exists, unless a maintainer explicitly chooses to change the
setting instead.

## Current state

- `AGENTS.md`: agent workflow rules.
- `docs/RELEASE_PROCESS.md`: release and promotion guidance.

Current excerpts:

```text
AGENTS.md:24-26
- Promotion PRs from `dev` to `main` should use a merge commit, not squash
  merge. If a promotion is squashed, sync `main` back into `dev` before opening
  the next promotion PR.
```

```text
docs/RELEASE_PROCESS.md:17-22
Use a merge commit for `dev` to `main` promotion PRs. Squash-merging promotion
PRs makes `main` and `dev` diverge, which can create conflicts on the next
promotion PR even when file content is already aligned.

Open the promotion PR from `dev` itself, or from a branch that preserves `dev`
ancestry. Do not copy the `dev` tree onto `main` as a single-parent commit.
```

Live repository settings observed during the audit:

```json
{"deleteBranchOnMerge":true,"mergeCommitAllowed":false,"rebaseMergeAllowed":true,"squashMergeAllowed":true}
```

Repo conventions:

- Documentation and workflow guidance are plain Markdown.
- Keep release wording honest about current repository state.
- Do not claim automation or settings that do not exist.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Check repo merge settings | `gh repo view vnedyalk0v/pi-codeflow --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed,deleteBranchOnMerge` | exit 0, JSON returned |
| Docs validation | `npm run check:docs` | exit 0 |
| Text safety | `npm run check:text` | exit 0 |
| Full gate | `npm run check` | exit 0 |

## Scope

**In scope**:

- `AGENTS.md`
- `docs/RELEASE_PROCESS.md`
- `plans/README.md`

**Out of scope**:

- Runtime extension code.
- GitHub Actions workflow changes.
- Publishing or release automation.
- Changing GitHub repository settings without explicit maintainer approval.

## Git workflow

- Branch: `docs/001-align-promotion-policy`
- Commit style: conventional commit, for example `docs: align promotion merge policy`
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify current repository merge settings

Run:

```sh
gh repo view vnedyalk0v/pi-codeflow --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed,deleteBranchOnMerge
```

If `mergeCommitAllowed` is still `false`, continue with the documentation fix
below. If `mergeCommitAllowed` is now `true`, STOP and report that the live
repository setting changed; the docs may already be directionally correct.

**Verify**: command exits 0 and reports `mergeCommitAllowed: false`.

### Step 2: Update the agent promotion rule

In `AGENTS.md`, replace the merge-commit requirement with the actual current
policy:

- promotion PRs may be squash-merged because the repository disallows merge
  commits;
- after every squash promotion, sync `main` back into `dev` before opening the
  next promotion PR;
- compare branch tree/content before assuming a promotion conflict means file
  content differs.

Do not add a long procedure here; keep `AGENTS.md` concise and point details to
`docs/RELEASE_PROCESS.md`.

**Verify**: `rg -n "merge commit|squash|sync.*main.*dev" AGENTS.md` shows the
new concise rule and no stale "should use a merge commit" instruction.

### Step 3: Update the release process details

In `docs/RELEASE_PROCESS.md`, update `## Promotion merge policy` so it documents
the current repo setting:

- merge commits are not currently enabled for this repository;
- use the allowed promotion merge method chosen by maintainers;
- when the promotion is squash-merged, immediately sync `main` back into `dev`;
- verify tree equality with `git rev-parse origin/main^{tree}` and
  `git rev-parse origin/dev^{tree}` after sync;
- do not rely only on commit counts because histories can differ while content
  matches.

Keep this as a short operational checklist. Do not add scripts.

**Verify**:

```sh
rg -n "mergeCommitAllowed|squash|rev-parse.*\\^\\{tree\\}|commit counts" docs/RELEASE_PROCESS.md
```

Expected: the file mentions the current allowed-method reality, the squash-sync
requirement, and tree/content verification.

### Step 4: Validate and update plan status

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

- No runtime tests are required because this is docs-only.
- `npm run check:docs` and `npm run check:text` are the relevant checks.
- `npm run check` confirms the whole package still validates.

## Done criteria

- [ ] `AGENTS.md` no longer tells agents to use a merge commit when the repo
      disallows merge commits.
- [ ] `docs/RELEASE_PROCESS.md` documents squash promotion plus immediate
      `main` back into `dev` sync as the current path.
- [ ] The docs mention tree/content verification, not just commit-count checks.
- [ ] `npm run check:docs` exits 0.
- [ ] `npm run check:text` exits 0.
- [ ] `npm run check` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- `mergeCommitAllowed` is now `true`.
- A maintainer asks to change GitHub repository settings instead of docs.
- The in-scope files changed and no longer match the excerpts above.
- The fix appears to require release automation or GitHub Actions changes.

## Maintenance notes

If maintainers later enable merge commits, update `AGENTS.md` and
`docs/RELEASE_PROCESS.md` in the same PR as the settings change. Reviewers
should check that the documented promotion path matches live repository settings,
not just the preferred workflow.
