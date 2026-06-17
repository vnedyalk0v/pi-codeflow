# Commits

`/flow-commit` is implemented as the v0.6 foundation for deterministic,
template-rendered commit messages.

The AI agent should not freeform-write the final commit message. Instead:

1. The agent analyzes the staged diff.
2. The agent returns a structured commit payload.
3. Codeflow validates the payload.
4. Codeflow renders the final commit message from the configured commit
   template.
5. Codeflow commits the already-staged changes with the rendered message file.

`/flow-commit` does not stage files, push, open PRs, watch GitHub checks,
resolve review comments, or merge branches.

## Command usage

```text
/flow-commit --payload .pi/codeflow/commit-payload.json
/flow-commit --dry-run --payload .pi/codeflow/commit-payload.json
/flow-commit --allow-unverified --payload .pi/codeflow/commit-payload.json
```

`--dry-run` renders and validates the message without creating a commit.
`--allow-unverified` allows a commit when the latest `/flow-check` state failed
or is missing, and it also explicitly permits an empty verification payload. It
still records warnings and does not push or open a PR.

## Required payload shape

```json
{
  "type": "feat",
  "scope": "billing",
  "summary": "add stripe webhook signature verification",
  "context": "Why this change is needed.",
  "changes": [
    "What changed."
  ],
  "verification": [
    "npm run lint",
    "npm run typecheck",
    "npm test"
  ],
  "risk": "Low/medium/high risk and why.",
  "refs": ["BILL-142"]
}
```

The schema also supports optional `breakingChange` and `footers` fields.

## Required fields

| Field | Rule |
| --- | --- |
| `type` | Must be one of the configured allowed commit types. |
| `summary` | Concise imperative phrase, no trailing punctuation, default title max 72 characters. |
| `context` | Explains why the change is needed. |
| `changes` | Non-empty list of concrete changes. |
| `verification` | Non-empty list unless config disables `commits.requireVerification` or unverified commit override is explicit. |
| `risk` | Human-readable risk level and rationale unless config disables `commits.requireRisk`. |

## Optional fields

| Field | Rule |
| --- | --- |
| `scope` | Short lowercase component name without spaces. |
| `refs` | Issue or ticket references. Missing refs render as `Refs: none`. |
| `breakingChange` | Renders `BREAKING CHANGE: ...` and, by default, a `!` title marker. |
| `footers` | Additional deterministic commit footers. |

## Allowed commit types

- `feat`
- `fix`
- `hotfix`
- `refactor`
- `perf`
- `docs`
- `test`
- `chore`
- `ci`
- `build`
- `revert`

## Field validation rules

- `type` must match `commits.allowedTypes`.
- `scope`, when present, must contain lowercase letters, numbers, hyphens, or
  dots.
- `summary` must not be generic: `update`, `changes`, `fix stuff`, `misc`, or
  `wip`.
- `summary` must not end with trailing punctuation.
- `changes` must be an array with at least one item.
- `verification` must be an array and must contain at least one item unless the
  resolved config disables `commits.requireVerification` or the command uses the
  explicit `--allow-unverified` override.
- `risk` is required by default config and must be non-empty unless
  `commits.requireRisk` is false.
- Payloads must not include secrets, tokens, or private credentials.

## Conventional Commits compatibility

Rendered commit titles follow Conventional Commits:

```text
<type>(<scope>): <summary>
```

When `scope` is omitted:

```text
<type>: <summary>
```

When `breakingChange` is present and `commits.useBreakingChangeMarker` is true,
Codeflow renders:

```text
<type>(<scope>)!: <summary>
```

Codeflow checks the rendered title length against `commits.maxTitleLength`. The
configured `commits.titleLengthPolicy` decides whether an overlong title is an
error or warning. Codeflow does not silently truncate titles.

## Rendered commit format

```text
feat(billing): add stripe webhook signature verification

Context:
Stripe webhooks were accepted without verifying request authenticity.

Changes:
- Added signature verification middleware.
- Added timestamp tolerance validation.
- Added tests for invalid and expired signatures.

Verification:
- npm run lint
- npm run typecheck
- npm test

Risk:
Low. Invalid webhook requests are rejected before processing.

Refs: BILL-142
```

Breaking changes render after `Risk`:

```text
BREAKING CHANGE: Webhook requests without a valid signature are rejected.
```

## Staged-change behavior

`/flow-commit` commits only staged changes.

- It refuses to commit when no staged changes exist.
- It does not run `git add .`.
- It does not discard unstaged changes.
- It warns when unstaged or untracked files are present.
- Unstaged and untracked files remain outside the commit unless already staged.

## Reserved branch behavior

Normal commits are refused on reserved branches such as `main`, `master`, `dev`,
`develop`, `stage`, `staging`, `release`, and `production`.

`--allow-reserved-branch` is only honored when the resolved emergency config also
allows reserved-branch work. The default config does not allow it.

## Latest-check policy

`/flow-commit` uses the latest `/flow-check` session state when available.

- Passed checks allow the commit.
- Failed checks block by default.
- `--allow-unverified` permits the commit with a warning.
- `commits.allowUnverifiedCommits` affects check-state policy only; it does not
  waive payload verification when `commits.requireVerification` remains true.
- Missing, skipped, or `no_checks` state warns by default.
- If `commits.requirePassedChecksBeforeCommit` is true, missing or non-passed
  check state blocks unless unverified commits are explicitly allowed.
- Dry-runs report check-state warnings but never create a commit.

## Dry-run behavior

Dry-run mode validates the payload, checks branch and staged-change safety,
renders the final message, and returns the preview. It does not call
`git commit`, does not update commit state to `committed`, and does not push.

## Commit state

After a successful commit, Codeflow stores bounded metadata only:

- commit SHA;
- branch;
- title;
- type;
- scope;
- summary;
- refs;
- commit timestamp.

Large commit bodies, stdout, stderr, and diffs are not stored in commit state.

## Good example

```json
{
  "type": "docs",
  "scope": "workflow",
  "summary": "harden lifecycle specification",
  "context": "Implementation work needs a stable lifecycle contract before extension code begins.",
  "changes": [
    "Expanded lifecycle phases and transitions.",
    "Aligned prompts, templates, schemas, and config examples."
  ],
  "verification": [
    "npm run check",
    "JSON validation script"
  ],
  "risk": "Low. Documentation and schema changes only.",
  "refs": ["#1", "#2"]
}
```

## Bad examples

```text
fix stuff
```

Problems:

- no structured payload;
- vague summary;
- no context;
- no verification;
- no risk.

```json
{
  "message": "feat: add cool thing"
}
```

Problems:

- asks the model to render the final message;
- missing required fields;
- no risk or verification evidence.

## Relationship between branch type and commit type

The primary commit type should usually match the branch prefix. A `docs/` branch
usually contains `docs` commits, and a `fix/` branch usually contains `fix`
commits.

Exceptions are allowed when a PR legitimately contains supporting changes. For
example, a `feat/` branch may include a `test` commit that adds coverage for the
feature.

## Multi-commit PR behavior

- Prefer one focused commit for small changes.
- Use multiple commits when it improves reviewability.
- Each commit still requires a structured payload.
- Avoid mixing unrelated behavior changes in one PR.

## Fix commits after reviewer comments

Reviewer-comment fixes should be small and specific. The commit payload should
reference the review finding when possible, describe what changed, and include
verification that the comment was addressed.
