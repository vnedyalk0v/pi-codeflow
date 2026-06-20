# Pull Requests

The v0.6 `/flow-pr` foundation is implemented, and the v0.7 `/flow-watch`
foundation watches GitHub PR checks after a PR is open. The AI agent still must
not freeform-write the final PR title or body.

Instead:

1. The agent provides a structured PR payload.
2. Codeflow validates the payload against `schemas/pr-payload.schema.json` plus
   semantic config rules.
3. Codeflow renders the final PR title from structured title fields.
4. Codeflow renders the final PR body from `templates/pull-request.md` or the
   configured PR template.
5. Codeflow opens or updates a GitHub PR with `gh pr create` or `gh pr edit`.
6. Codeflow watches required or all GitHub PR checks afterward with
   `/flow-watch`.

## Command usage

```text
/flow-pr --payload .pi/codeflow/pr-payload.json
/flow-pr --dry-run --payload .pi/codeflow/pr-payload.json
/flow-pr --draft --payload .pi/codeflow/pr-payload.json
/flow-pr --ready --payload .pi/codeflow/pr-payload.json
/flow-pr --base dev --payload .pi/codeflow/pr-payload.json
```

Dry-run mode renders the title and body preview, validates policy, and does not
push, call GitHub, or fetch missing remote-tracking refs for head-branch
comparison.

## Structured payload

The implemented payload shape is nested so title fields stay separate from body
fields:

```json
{
  "title": {
    "type": "feat",
    "scope": "pull-requests",
    "summary": "implement generated pull requests",
    "ticket": "FLOW-12"
  },
  "body": {
    "summary": "Implemented the /flow-pr foundation.",
    "context": "Codeflow needs deterministic PR formatting.",
    "changes": ["Added structured payload validation."],
    "verification": ["npm test"],
    "selfReview": ["Confirmed merge automation was not added."],
    "risk": "Medium. This opens GitHub PRs.",
    "rollback": "Revert the PR.",
    "reviewerNotes": "Focus on GitHub CLI error handling.",
    "refs": ["#12"]
  },
  "draft": true,
  "baseBranch": "dev",
  "headBranch": "feat/flow-pr-generated-title-body"
}
```

## Validation rules

Required title fields:

- `title.type`
- `title.summary`

Required body fields:

- `body.summary`
- `body.context`
- `body.changes` with at least one item
- `body.risk`
- `body.rollback`

Default policy also requires:

- `body.verification` with at least one item;
- `body.selfReview` with at least one item.

Projects can explicitly allow PR payloads without verification or self-review by
configuring `pullRequest.requireVerification` or
`pullRequest.requireSelfReview` to `false`. Unknown payload fields are rejected
by the schema.

## PR title rendering

Codeflow renders the final PR title deterministically from `title` fields. The
default format is:

```text
{{ticketPrefix}}{{type}}{{scopeSuffix}}: {{summary}}
```

Examples:

```text
feat(config): add default config validation
fix(checks): handle timeout summaries
docs: update configuration guide
[BILL-142] feat(billing): add stripe webhook verification
```

Title length is checked with `pullRequest.maxTitleLength` and
`pullRequest.titleLengthPolicy`. Codeflow warns or fails based on config. It does
not silently truncate titles. Validation error details redact likely secrets from
rendered title previews.

## PR body rendering

The default template renders these sections in order:

- Summary
- Context
- Changes
- Verification
- Self-review
- Risk
- Rollback
- Reviewer notes
- Linked issues

`changes` render as bullets. `verification` and `selfReview` render as checked
Markdown checklist items. Linked issues use `Refs` by default, not closing
keywords. Payload text that contains literal `{{placeholder}}` examples is
escaped so it is not re-expanded as template syntax. Before output is sent to
GitHub, Codeflow redacts likely secrets from the rendered title and body,
including copied verification output.

If the configured template is missing, Codeflow uses the bundled default PR
template and returns a warning. If a configured template exists but cannot be
read as a file, rendering fails with a clear error.

## Base and head branch behavior

Base branch resolution order:

1. explicit `/flow-pr --base` option;
2. `payload.baseBranch`;
3. `config.pullRequest.baseBranch`;
4. `config.baseBranches.default`.

Head branch resolution order:

1. explicit `/flow-pr --head` option;
2. `payload.headBranch`;
3. the current git branch.

Resolved base/head values must be Codeflow git branch names before any git or
GitHub CLI call sees them. Codeflow rejects empty values, option/refspec-like
forms (leading `-` or `+`, `refs/` prefixes, `HEAD`, `@`), whitespace/control
characters, Git ref metacharacters (`..`, `@{`, `~`, `^`, `:`, `?`, `*`, `[`,
`\\`), empty path components, leading-dot path components, `.lock` path
components, and trailing `/` or `.`.

Codeflow refuses normal PR creation when:

- the configured base branch is missing on origin;
- base or head is not a valid Codeflow git branch name;
- base and head are the same;
- the head branch is reserved;
- the base branch is outside `baseBranches.allowed`;
- the branch cannot be pushed or found remotely;
- pushing is disabled and the actual remote head does not match the local head
  branch that would otherwise be omitted from the PR.

Uncommitted changes do not block by default, but Codeflow warns that they are
not included in the PR until committed and pushed.

## Draft PR behavior

Draft selection order for new PRs:

1. explicit `/flow-pr --draft` or `/flow-pr --ready` option;
2. `payload.draft`;
3. `config.pullRequest.draftByDefault`.

The default is conservative and opens draft PRs.

When updating an existing PR, explicit command draft/ready flags or
`payload.draft` apply the requested transition through `gh pr ready` or
`gh pr ready --undo`. The configured default does not silently change an
existing PR's draft state.

## Check-state and commit-state policy

`/flow-pr` reads the latest in-session `/flow-check` and `/flow-commit` state
when available.

- Passed latest checks allow PR creation.
- Failed latest checks block by default.
- `--allow-unverified` or `pullRequest.openWhenChecksFail` allows failed checks
  with a warning when passed checks are not required.
- Missing or `no_checks` state warns by default.
- `pullRequest.requirePassedChecksBeforePr` makes missing or non-passed checks
  block unless `/flow-pr --allow-unverified` is explicit.
- Missing `/flow-commit` metadata warns that the PR may include commits not
  created through `/flow-commit`.
- `/flow-commit` metadata from a different branch than the resolved PR head
  warns that the PR may include commits not created through `/flow-commit`.
- Ahead-of-base warnings compare the resolved PR head, not always the current
  checkout. When Codeflow will push the current head branch, it compares `HEAD`;
  when pushing is disabled, it compares the remote PR head branch.

## GitHub CLI integration

Normal `/flow-pr` uses the GitHub CLI with explicit arguments:

```text
gh pr create --base <base> --head <head> --title <title> --body-file <file>
```

`--draft` is added when draft behavior is active. Codeflow does not use
`--fill`, because the extension owns final title/body formatting.

If a PR already exists for the branch and `pullRequest.updateExisting` is true,
Codeflow discovers the existing PR and updates title, body, and requested base
branch with `gh pr edit`. If updates are disabled, it returns a clear error and
includes the existing PR URL when discoverable. PR URLs returned by `gh` may use
`github.com` or a GitHub Enterprise hostname and may include a trailing slash.

## GitHub checks after PR creation

After `/flow-pr` opens or updates a PR, use `/flow-watch` to read GitHub PR
checks. The watcher determines the target PR from `--pr`, latest stored PR state,
or the PR associated with the current branch.

Usage examples:

```text
/flow-watch
/flow-watch --pr 123
/flow-watch --required
/flow-watch --all
/flow-watch --fail-fast
/flow-watch --interval 10
/flow-watch --timeout 600
/flow-watch --dry-run
```

Behavior:

- required-only mode calls `gh pr checks --required --json ...`;
- all-checks mode calls `gh pr checks --json ...` without the required filter;
- all returned v1 check rows are treated as required because GitHub CLI JSON has
  no per-row requirement metadata;
- non-zero `gh pr checks --json` exits with JSON rows are parsed before error
  mapping so failed checks can be summarized;
- descriptions and details links are redacted before they are returned, rendered,
  or stored;
- `--dry-run` returns dry-run next actions instead of unknown-status guidance;
- passed selected checks move the lifecycle to `verified`;
- pending checks, including timeout cases, keep the lifecycle in `ci_waiting`;
- unknown selected checks take priority over pending checks and move to
  `blocked` conservatively;
- watch mode keeps polling empty check samples until checks appear or timeout;
- failed, skipped-only, cancelled, timed-out, or unknown selected checks move to
  `blocked`;
- no checks after timeout or single-sample mode, including GitHub CLI `no
  required checks reported` responses, produce `no_checks` and must not be
  treated as verified evidence.

`/flow-watch` does not implement review-comment triage. It also does not rerun
workflows, merge, approve, request review, resolve comments, reply to comments,
push commits, or delete branches.

## Out of scope

`/flow-pr` does not implement:

- review comment automation;
- merge automation;
- auto-approval;
- auto-resolving reviewer comments;
- branch deletion.
