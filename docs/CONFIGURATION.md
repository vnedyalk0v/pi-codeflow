# Configuration

The project-level configuration file is `.pi/codeflow.json`. The v0.6
foundation loads package defaults, optionally loads project config, merges the
two layers, validates the resolved config, uses the resolved config to build
before-agent Codeflow guidance, applies branch policy in `/flow-start`, runs
configured local checks in `/flow-check`, renders staged commits through
`/flow-commit`, and renders/opens pull requests through `/flow-pr`.

## Config resolution order

The v0.2 loader implements this resolution order:

1. If an explicit `configPath` is provided, load that file.
2. Otherwise search for `.pi/codeflow.json` from the requested `cwd` upward.
3. If no project config exists, use `config/default.codeflow.json`.
4. If project config exists, merge it over `config/default.codeflow.json`.
5. Validate the final resolved config against `schemas/codeflow.schema.json`.

When no project config is found, the loader returns `usedDefaultConfig: true`
and `configPath: null`. When a project config is found, it returns
`usedDefaultConfig: false` and the absolute path to that config file.

Command-specific overrides are reserved for a future milestone. `/flow-start`
reads the resolved config and may create or switch to a semantic work branch.
`/flow-check` reads the resolved config and runs only configured local checks.
`/flow-commit` reads the resolved config, validates structured commit payloads,
renders the commit template, and commits staged changes only. `/flow-pr` reads
structured PR payloads, renders the PR title/body, safely pushes the current
feature branch when configured, and opens or updates the GitHub PR. These
commands do not watch GitHub checks, resolve review comments, approve, or merge.

## Default config

The default config lives in `config/default.codeflow.json`. It is conservative:

- empty `checks` array is allowed;
- destructive operations are disabled;
- direct work on reserved branches is disabled;
- emergency override requires a reason;
- emergency flow requires a final report;
- review comments are auto-resolved only when fixed, stale, or already fixed
  according to policy.

## Project config path

Projects should use:

```text
.pi/codeflow.json
```

The repository examples in `config/` are package examples, not active project
config.

## Merge behavior

The v0.2 merge is conservative:

- objects merge recursively;
- arrays replace the default array;
- scalar values replace the default scalar;
- unknown properties are preserved so schema validation can reject them;
- `null` values are not treated as delete operations.

This means a project can replace `checks` or `reservedBranches` with a new
array. A project can also override one nested field, such as
`branching.slug.maxLength`, without repeating the rest of `branching.slug`.

If a project sets a required object such as `baseBranches` to `null`, the merge
keeps that `null` value and schema validation fails.

## Optional `extends` behavior

`extends` is reserved for a later milestone. The schema accepts the field so
future config files can keep a stable shape, but the v0.2 loader does not
resolve it.

If `.pi/codeflow.json` or an explicit config file contains `extends`, the loader
returns a typed `unsupported_extends` load error. Direct schema validation may
return a warning for `extends`, but it does not load extended files.

## Validation behavior

- Parse JSON before any git mutation.
- Validate against `schemas/codeflow.schema.json` using draft 2020-12.
- Validate semantic config rules that JSON Schema cannot express by itself.
- Validate the final merged config, not just the project patch.
- Report all practical validation errors with config paths.
- Return stable Codeflow error objects instead of raw validator errors.
- Refuse to continue when safety-critical config is invalid.

## Error behavior

- Invalid config moves the workflow to `blocked`.
- Missing base branch moves the workflow to `blocked` unless fallback is enabled.
- Unknown branch or commit types are invalid.
- Unknown review comment classifications are invalid.
- Template paths that cannot be resolved are invalid before rendering.

The v0.2 loader exposes typed load failures for missing explicit files, invalid
JSON, unreadable files, unsupported `extends`, and schema validation failure.

## Validation error examples

Unknown top-level key:

```json
{
  "path": "/unknownKey",
  "keyword": "additionalProperties",
  "message": "/unknownKey is not allowed"
}
```

Invalid enum value:

```json
{
  "path": "/branching/defaultType",
  "keyword": "enum",
  "message": "must be equal to one of the allowed values",
  "allowedValues": [
    "feat",
    "fix",
    "hotfix",
    "refactor",
    "perf",
    "docs",
    "test",
    "chore",
    "ci",
    "build",
    "revert"
  ]
}
```

Missing conditional fallback branch:

```json
{
  "path": "/baseBranches/fallback",
  "keyword": "required",
  "message": "/baseBranches/fallback is required"
}
```

Pull request base outside allowed base branches:

```json
{
  "path": "/pullRequest/baseBranch",
  "keyword": "allowedBaseBranch",
  "message": "/pullRequest/baseBranch must be listed in /baseBranches/allowed"
}
```

## Base branch fallback

`baseBranches.missingDefaultBehavior` controls what happens when the configured
`baseBranches.default` branch is missing.

- Use `block` to stop in `blocked` and ask for maintainer guidance.
- Use `fallback` only when `baseBranches.fallback` is also configured.
- The schema requires `baseBranches.fallback` whenever fallback behavior is
  selected, so validation cannot pass without a branch to use.
- The fallback branch should also appear in `baseBranches.allowed`.

## Top-level keys

| Key | Purpose |
| --- | --- |
| `reservedBranches` | Branches where normal AI work is not allowed. |
| `baseBranches` | Default, allowed, and fallback base branch policy. |
| `branching` | Branch types, branch template, and slug rules. |
| `commits` | Commit template and structured payload rules. |
| `pullRequest` | PR title/body templates, base branch, draft, checks, push, and payload policy. |
| `checks` | Ordered local checks. |
| `reviewComments` | Review comment classifications and resolution policy. |
| `emergency` | Emergency override and hotfix policy. |
| `templates` | Named template paths. |
| `guidance` | Proactive guidance and structured-output behavior. |
| `safety` | Fallback safety boundaries. |

## Commit policy

The `commits` object controls structured commit payload validation, template
rendering, and local commit safety.

| Field | Purpose |
| --- | --- |
| `template` | Commit template path used when it differs from the package default. |
| `conventional` | Declares Conventional Commit-compatible title rendering. |
| `allowedTypes` | Commit types accepted in structured payloads. |
| `requireStructuredPayload` | Requires model output to be a structured payload. |
| `performCommit` | Allows `/flow-commit` to run `git commit` in normal mode. |
| `requireBody` | Requires rendered messages to include a body. |
| `requireVerification` | Requires payload `verification` to contain at least one item. |
| `requireRisk` | Requires payload `risk` to be non-empty. |
| `maxTitleLength` | Maximum rendered title length; default is 72. |
| `titleLengthPolicy` | `error` blocks overlong titles; `warning` reports but allows them. |
| `useBreakingChangeMarker` | Adds `!` to Conventional Commit titles when `breakingChange` exists. |
| `allowUnverifiedCommits` | Lets failed or missing check-state proceed with warnings; it does not waive payload verification. |
| `requirePassedChecksBeforeCommit` | Requires latest `/flow-check` state to be `passed`. |

Default behavior is conservative: structured payloads, body, verification, risk,
and safe staged-change commits are required. Failed latest check state blocks by
default. Missing or `no_checks` state warns by default unless
`requirePassedChecksBeforeCommit` is enabled.

`/flow-commit` resolves template paths from the repository root and then the
package root. If a configured template is missing, the bundled default commit
template is used with a warning. If a configured template exists but cannot be
read as a file, rendering fails.

## Pull request policy

The `pullRequest` object controls structured PR payload validation, title/body
rendering, branch safety, GitHub CLI behavior, and bounded PR state.

| Field | Purpose |
| --- | --- |
| `template` | PR body template path used when it differs from the package default. |
| `titleTemplate` | Deterministic PR title template using `type`, `scopeSuffix`, `summary`, `ticket`, and `ticketPrefix`. |
| `baseBranch` | Default PR base branch. |
| `draftByDefault` | Opens draft PRs unless payload or command flags override it. |
| `requireVerification` | Requires payload `body.verification` to contain at least one item. |
| `requireSelfReview` | Requires payload `body.selfReview` to contain at least one item. |
| `openWhenChecksFail` | Allows failed latest `/flow-check` state with a warning when `requirePassedChecksBeforePr` is false. |
| `updateExisting` | Updates title/body on an existing branch PR when discoverable. |
| `maxTitleLength` | Maximum rendered PR title length; default is 120. |
| `titleLengthPolicy` | `error` blocks overlong titles; `warning` reports but allows them. |
| `requirePassedChecksBeforePr` | Requires latest `/flow-check` state to be `passed`. |
| `pushBeforeCreate` | Safely pushes the current feature branch before `gh pr create`. |
| `linkKeyword` | Issue link keyword for default PR body rendering; default is `Refs`. |

Default behavior is conservative: structured payloads, verification,
self-review, draft PRs, explicit base/head, safe feature-branch push, and `Refs`
linked issues. Failed latest check state blocks by default. `openWhenChecksFail` can downgrade
failed checks to warnings only when `requirePassedChecksBeforePr` is false.
Missing or `no_checks` state warns by default unless
`requirePassedChecksBeforePr` is enabled. Explicit `/flow-pr --allow-unverified`
can override these local check-state gates.

`/flow-pr` resolves template paths from the repository root and then the package
root. If a configured PR template is missing, the bundled default PR template is
used with a warning. If a configured template exists but cannot be read as a
file, rendering fails.

The implemented PR behavior does not watch GitHub checks, request reviews,
resolve review comments, approve, merge, or delete branches.

## Guidance policy

The guidance generator honors the resolved `guidance` flags:

- `proactive` controls whether the injected guidance tells agents to proactively
  steer toward the next lifecycle step.
- `requireStructuredPayloads` controls whether structured payload instructions
  are injected as mandatory guidance.
- `renderOutputsFromTemplates` controls whether template-rendered output
  instructions are injected as mandatory guidance.
- `stopForHumanDecisions` controls whether guidance tells agents to stop when
  product, security, legal, credential, merge, release, or ambiguous review
  decisions are required.

## Checks

`checks` is an ordered array of project-owned local commands. `/flow-check` runs
configured checks in array order. It does not accept arbitrary command arguments
from the user; command strings come only from validated Codeflow config.

Each check includes:

- `name`: required display name used in summaries and stored state.
- `command`: required shell-like command string, such as `npm run lint`.
- `cwd`: optional working directory, resolved relative to the repository root or
  command cwd.
- `timeoutMs`: optional timeout in milliseconds.
- `timeoutSeconds`: backward-compatible timeout in seconds; prefer `timeoutMs`
  for new configs.
- `required`: optional boolean; defaults to `true` when omitted.

Example:

```json
{
  "checks": [
    {
      "name": "lint",
      "command": "npm run lint",
      "timeoutMs": 120000,
      "required": true
    },
    {
      "name": "audit",
      "command": "npm audit --audit-level=high",
      "required": false
    }
  ]
}
```

Execution policy:

- checks run sequentially, never in parallel;
- non-zero exits are `failed`;
- timeouts are `timed_out`;
- optional failed checks are summarized but do not fail the overall run;
- the default command policy stops after the first failed required check;
- `/flow-check --continue-on-failure` or `/flow-check --all` continues and
  collects all results;
- `/flow-check --stop-on-failure` makes the default stop policy explicit;
- `/flow-check --dry-run` records planned checks as skipped and executes
  nothing;
- no configured checks record `no_checks` with a warning rather than failing.

## Template resolution

Template paths are resolved from the repository root unless a future config key
explicitly changes the base directory. For branch names, a non-default
`branching.template` takes precedence over `templates.branchName`; otherwise the
named branch template is used. Missing templates block rendering.

## Branch policy configuration

Branching config controls:

- allowed branch types;
- default branch type, which must also be listed in `allowedTypes`;
- branch name template;
- slug case;
- slug length;
- branch collision handling;
- ticket detection through `branching.ticketPattern`.

## Emergency behavior configuration

Emergency config controls:

- whether emergency flow is enabled;
- whether direct reserved-branch work is ever allowed;
- whether a reason is required;
- whether structured commits and PRs are still required;
- whether final reports and backport notes are required.

## Review comment classification configuration

Review comments use these classifications:

- `valid`
- `invalid`
- `stale`
- `already_fixed`
- `needs_human`

Resolution policy should be conservative. Valid comments are resolved only after
a fix and verification. Invalid comments normally require human review.

## Complete example `.pi/codeflow.json`

```json
{
  "$schema": "https://github.com/vnedyalk0v/pi-codeflow/schemas/codeflow.schema.json",
  "reservedBranches": [
    "main",
    "master",
    "dev",
    "develop",
    "stage",
    "staging",
    "release",
    "production"
  ],
  "baseBranches": {
    "default": "dev",
    "allowed": ["dev", "develop", "main"],
    "fallback": "main",
    "missingDefaultBehavior": "block"
  },
  "branching": {
    "allowedTypes": [
      "feat",
      "fix",
      "hotfix",
      "refactor",
      "perf",
      "docs",
      "test",
      "chore",
      "ci",
      "build",
      "revert"
    ],
    "defaultType": "feat",
    "template": "templates/branch-name.md",
    "ticketPattern": "\\b[A-Z][A-Z0-9]+-\\d+\\b",
    "slug": {
      "case": "kebab",
      "maxLength": 60,
      "ticketPrefixAllowed": true,
      "collisionSuffix": "increment"
    }
  },
  "commits": {
    "template": "templates/commit-message.md",
    "conventional": true,
    "allowedTypes": [
      "feat",
      "fix",
      "hotfix",
      "refactor",
      "perf",
      "docs",
      "test",
      "chore",
      "ci",
      "build",
      "revert"
    ],
    "requireStructuredPayload": true,
    "performCommit": true,
    "requireBody": true,
    "requireVerification": true,
    "requireRisk": true,
    "maxTitleLength": 72,
    "titleLengthPolicy": "error",
    "useBreakingChangeMarker": true,
    "allowUnverifiedCommits": false,
    "requirePassedChecksBeforeCommit": false
  },
  "pullRequest": {
    "template": "templates/pull-request.md",
    "titleTemplate": "{{ticketPrefix}}{{type}}{{scopeSuffix}}: {{summary}}",
    "baseBranch": "dev",
    "draftByDefault": true,
    "requireVerification": true,
    "requireSelfReview": true,
    "openWhenChecksFail": false,
    "updateExisting": true,
    "maxTitleLength": 120,
    "titleLengthPolicy": "warning",
    "requirePassedChecksBeforePr": false,
    "pushBeforeCreate": true,
    "linkKeyword": "Refs"
  },
  "checks": [],
  "reviewComments": {
    "classifications": ["valid", "invalid", "stale", "already_fixed", "needs_human"],
    "autoResolveWhen": ["fixed", "stale", "already_fixed"],
    "resolveValidOnlyAfterFix": true,
    "invalidRequiresHumanReview": true,
    "needsHumanBlocks": true
  },
  "emergency": {
    "enabled": true,
    "defaultPath": "hotfix_branch",
    "allowReservedBranchWork": false,
    "requireReason": true,
    "requireFinalReport": true,
    "requireStructuredCommitAndPr": true,
    "documentBackportToDev": true
  },
  "templates": {
    "branchName": "templates/branch-name.md",
    "commitMessage": "templates/commit-message.md",
    "pullRequest": "templates/pull-request.md",
    "reviewReply": "templates/review-reply.md",
    "finalReport": "templates/final-report.md"
  },
  "guidance": {
    "proactive": true,
    "requireStructuredPayloads": true,
    "renderOutputsFromTemplates": true,
    "stopForHumanDecisions": true,
    "trackedPhases": [
      "idle",
      "initialized",
      "branch_prepared",
      "planning",
      "implementing",
      "local_checks",
      "self_review",
      "fixing_local_findings",
      "ready_to_commit",
      "committed",
      "pr_opened",
      "ci_waiting",
      "review_triage",
      "fixing_review_findings",
      "verified",
      "final_reported",
      "blocked",
      "emergency"
    ]
  },
  "safety": {
    "blockDirectWorkOnReservedBranches": true,
    "allowDestructiveGitOperations": false,
    "allowForcePush": false,
    "allowDirectPushToRemote": false,
    "requireCleanWorkingTreeForStart": true,
    "redactSecretsFromReports": true
  }
}
```
