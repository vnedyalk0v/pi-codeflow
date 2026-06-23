# Configuration

The project-level configuration file is `.pi/codeflow.json`. The v0.7
foundation loads package defaults, optionally loads project config, merges the
two layers, validates the resolved config, uses the resolved config to build
before-agent Codeflow guidance, applies branch policy in `/flow-start`, runs
configured local checks in `/flow-check`, renders staged commits through
`/flow-commit`, renders/opens pull requests through `/flow-pr`, watches GitHub
PR checks through `/flow-watch`, reads review threads through read-only
`/flow-comments`, and safely replies/resolves review threads through
`/flow-fix-comments` after explicit review-fix evidence and policy gates.

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
feature branch when configured, and opens or updates the GitHub PR. `/flow-watch`
reads resolved watcher defaults and performs read-only GitHub check status
polling or sampling. `/flow-comments` reads `reviewComments` defaults for
unresolved-only mode, outdated-thread inclusion, author filters, max threads,
and triage classifications. `/flow-fix-comments` reads mutation-related
`reviewComments` defaults for reply templates, explicit apply behavior,
classification allow-lists, human-decision blockers, and checks-before-resolve.
These commands do not approve or merge.

## Default config

The default config lives in `config/default.codeflow.json`. It is conservative:

- empty `checks` array is allowed;
- destructive operations are disabled;
- direct work on reserved branches is disabled;
- emergency override requires a reason;
- emergency flow requires a final report;
- GitHub checks watching defaults to required checks only, a 10 second polling
  interval, a 900 second timeout, and fail-fast disabled;
- review comments use GitHub GraphQL as the `/flow-comments` and
  `/flow-fix-comments` provider;
- review-comment auto-reply and auto-resolution both default to disabled;
- `/flow-fix-comments` mutates only with explicit apply flags unless a project
  deliberately enables auto-reply or auto-resolution;
- review-thread resolution requires checks before resolve by default.

## Project config path

Projects should use:

```text
.pi/codeflow.json
```

The repository examples in `config/` are package examples, not active project
config.

## Starter examples

Use [Examples](EXAMPLES.md) for copyable project configs:

- minimal `.pi/codeflow.json`;
- Node app checks;
- Python service checks;
- monorepo checks;
- safe review-comments defaults;
- default template paths;
- GitHub checks watcher defaults.

The packaged example files are small patches over package defaults:

- `config/example.node.codeflow.json`
- `config/example.python.codeflow.json`
- `config/example.monorepo.codeflow.json`

Project config snippets are patches that merge over package defaults before
validation. Omit `$schema` in partial snippets unless a future project-config
patch schema exists.

## Minimal `.pi/codeflow.json`

Use this when a project wants Codeflow defaults and has not configured checks:

```json
{
  "baseBranches": {
    "default": "dev",
    "allowed": ["dev", "main"],
    "fallback": "main",
    "missingDefaultBehavior": "block"
  },
  "checks": []
}
```

An empty `checks` array is valid. `/flow-check` reports that no checks ran, and
agents must not present that as passing verification evidence.

## Check command configuration

Checks run sequentially from `checks`. Each entry should use a project-owned
command that is already safe for local developers to run:

```json
{
  "checks": [
    {
      "name": "typecheck",
      "command": "npm run typecheck",
      "timeoutMs": 120000
    },
    {
      "name": "test",
      "command": "npm test",
      "timeoutMs": 300000
    },
    {
      "name": "build",
      "command": "npm run build",
      "required": false
    }
  ]
}
```

`required: false` keeps an optional check from failing the full `/flow-check`
run, but the failure is still reported.

## Review-comments safety defaults

The default review-comments config is conservative:

```json
{
  "reviewComments": {
    "enabled": true,
    "provider": "github-graphql",
    "unresolvedOnly": true,
    "includeOutdated": false,
    "autoReply": false,
    "autoResolve": false,
    "autoResolveClassifications": ["stale", "already_fixed"],
    "requireChecksBeforeResolve": true,
    "requireHumanForInvalid": true,
    "requireHumanForNeedsHuman": true,
    "maxThreadsPerRun": 50,
    "replyTemplate": "templates/review-reply.md"
  }
}
```

This makes `/flow-comments` read-only and keeps `/flow-fix-comments` mutations
behind explicit apply flags and policy gates.

## Pull request and GitHub checks defaults

The default PR config opens draft PRs, requires structured evidence, pushes the
current feature branch for PR creation, and makes `/flow-watch` prefer required
checks:

```json
{
  "pullRequest": {
    "baseBranch": "dev",
    "draftByDefault": true,
    "requireVerification": true,
    "requireSelfReview": true,
    "openWhenChecksFail": false,
    "updateExisting": true,
    "requirePassedChecksBeforePr": false,
    "pushBeforeCreate": true,
    "linkKeyword": "Refs",
    "watchRequiredChecksOnly": true,
    "checksWatchIntervalSeconds": 10,
    "checksWatchTimeoutSeconds": 900,
    "failFast": false
  }
}
```

## Template paths

The default template paths are:

```json
{
  "templates": {
    "branchName": "templates/branch-name.md",
    "commitMessage": "templates/commit-message.md",
    "pullRequest": "templates/pull-request.md",
    "reviewReply": "templates/review-reply.md",
    "finalReport": "templates/final-report.md"
  }
}
```

Template paths resolve from the repository root and then the package root. Keep
custom templates committed with the project config that references them.

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
- Unknown review comment classifications in triage payloads are invalid.
- Template paths that cannot be resolved are invalid before rendering.

The v0.2 loader exposes typed load failures for missing explicit files, invalid
JSON, unreadable files, and schema validation failure.

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
- Base branch names in `default`, `allowed`, `fallback`, and
  `pullRequest.baseBranch` must use the same Codeflow git branch-name subset as
  `/flow-pr` payload `baseBranch`/`headBranch`: no leading `-` or `+`, no
  `refs/` prefix, no literal `HEAD` or `@`, no whitespace/control characters,
  no Git ref metacharacters, no empty or leading-dot path components, no `.lock`
  path components, and no trailing `/` or `.`.

## Top-level keys

| Key | Purpose |
| --- | --- |
| `reservedBranches` | Branches where normal AI work is not allowed. |
| `baseBranches` | Default, allowed, and fallback base branch policy. |
| `branching` | Branch types, branch template, and slug rules. |
| `commits` | Commit template and structured payload rules. |
| `pullRequest` | PR title/body templates, base branch, draft, checks, GitHub checks watcher defaults, push, and payload policy. |
| `checks` | Ordered local checks. |
| `reviewComments` | Review-thread provider/filter policy plus safe reply/resolution policy. |
| `emergency` | Emergency override and hotfix policy. |
| `templates` | Named template paths. |
| `guidance` | Proactive guidance and structured-output behavior. |
| `safety` | Fallback safety boundaries. |

## Safety flags

The `safety` object is intentionally small. Unsupported safety controls are
rejected by schema validation instead of accepted as no-ops.

- `requireCleanWorkingTreeForStart`: enforced by `/flow-start`. When true, a
  dirty working tree is blocked. When false, `/flow-start` proceeds and reports
  a warning instead.
- `blockDirectWorkOnReservedBranches`: affects guidance messaging only.
  Reserved-branch protection is always enforced regardless of this flag.

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
| `baseBranch` | Default PR base branch; must be a valid Codeflow git branch name and appear in `baseBranches.allowed`. |
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
| `watchRequiredChecksOnly` | Makes `/flow-watch` default to `gh pr checks --required`; default is `true`. |
| `checksWatchIntervalSeconds` | Default `/flow-watch` polling interval from `1` to `300` seconds; default is `10`. |
| `checksWatchTimeoutSeconds` | Default `/flow-watch` timeout from `1` to `3600` seconds; default is `900`. |
| `failFast` | Stops `/flow-watch` on the first selected failure when enabled; default is `false`. |

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

The implemented PR behavior does not request reviews, resolve review comments,
approve, merge, or delete branches. GitHub checks are handled separately by the
read-only `/flow-watch` command.

### GitHub checks watcher behavior

`/flow-watch` resolves its defaults from `pullRequest` and reads GitHub check
status with `gh pr checks`. Required-only mode adds `--required`; all-checks mode
omits that flag. The command polls with `checksWatchIntervalSeconds` until a
terminal result or `checksWatchTimeoutSeconds` is reached. `failFast` stops the
watch as soon as a selected check fails, while the default waits for pending
checks so the final summary can include more context.

Safety behavior:

- GitHub integration is read-only for check status.
- Empty or no-required-checks samples in watch mode keep polling until checks
  appear or timeout.
- No checks after timeout or single-sample mode produce a `no_checks` status and
  never claim verified evidence.
- Pending checks after timeout stay `pending` and keep the lifecycle in
  `ci_waiting`.
- Failed, skipped-only, cancelled, or timed-out selected checks block the flow
  for local fixes or explicit confirmation.
- `/flow-watch` does not rerun workflows, merge PRs, approve PRs, resolve
  comments, push branches, or delete branches.

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
- `timeoutMs`: optional timeout from `1` to `3600000` milliseconds.
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

## Review comment triage configuration

`reviewComments` config drives read-only `/flow-comments` triage and safe
`/flow-fix-comments` reply/resolution behavior. Defaults are conservative:
auto-reply and auto-resolution are disabled, checks are required before
resolution, invalid threads require human review by default, and `needs_human`
threads are never resolved.

| Field | Purpose |
| --- | --- |
| `enabled` | Enables `/flow-comments` and `/flow-fix-comments`. When false, review-thread triage and mutation are blocked. |
| `provider` | Review-thread provider. The only supported value is `github-graphql`. |
| `includeAuthors` | Optional allow-list of GitHub logins to include by default in `/flow-comments`. Empty means no allow-list. |
| `excludeAuthors` | Optional deny-list of GitHub logins to exclude by default. |
| `unresolvedOnly` | Lists unresolved review threads by default. |
| `includeOutdated` | Includes outdated threads when true. Defaults to false. |
| `autoReply` | Allows `/flow-fix-comments` to post policy-allowed replies without `--apply-replies`/`--apply`. Defaults to false. |
| `autoResolve` | Allows `/flow-fix-comments` to resolve policy-allowed threads without `--apply-resolutions`/`--apply`. Defaults to false. |
| `autoResolveClassifications` | Classification allow-list for automatic resolution. Defaults to `stale` and `already_fixed`; add `valid` only when valid findings may be auto-resolved without explicit `--apply-resolutions`/`--apply`. |
| `requireChecksBeforeResolve` | Requires passed latest `/flow-check` evidence or acceptable explicit verification evidence before resolution. Defaults to true. |
| `requireHumanForInvalid` | Blocks `invalid` thread resolution by default unless explicit policy/user override allows it. |
| `requireHumanForNeedsHuman` | Ensures `needs_human` remains a human-decision blocker and is never resolved. |
| `maxThreadsPerRun` | Bounds review-thread GraphQL reads, summaries, and stored state. Defaults to 50. If the bound is reached before GitHub pagination ends, `/flow-comments` reports an incomplete blocked scan; use a larger config value or `--max-threads`. |
| `replyTemplate` | Template path used by `/flow-fix-comments` to render deterministic review-thread replies. |

The read-only classification set is fixed by
`schemas/review-comment-triage.schema.json`: `valid`, `invalid`, `stale`,
`already_fixed`, and `needs_human`.

Review comments use these classifications in triage payloads:

- `valid`
- `invalid`
- `stale`
- `already_fixed`
- `needs_human`

Resolution policy must be conservative. Valid comments are resolved only after a
fix is committed and checks pass. Invalid comments normally require human review.
`needs_human` comments are never auto-resolved. Mass resolution is not supported;
every reply or resolution requires an explicit `threadId` in the review-fix
payload.

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
    "linkKeyword": "Refs",
    "watchRequiredChecksOnly": true,
    "checksWatchIntervalSeconds": 10,
    "checksWatchTimeoutSeconds": 900,
    "failFast": false
  },
  "checks": [],
  "reviewComments": {
    "enabled": true,
    "provider": "github-graphql",
    "includeAuthors": [],
    "excludeAuthors": [],
    "unresolvedOnly": true,
    "includeOutdated": false,
    "autoReply": false,
    "autoResolve": false,
    "autoResolveClassifications": ["stale", "already_fixed"],
    "requireChecksBeforeResolve": true,
    "requireHumanForInvalid": true,
    "requireHumanForNeedsHuman": true,
    "maxThreadsPerRun": 50,
    "replyTemplate": "templates/review-reply.md"
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
    "requireCleanWorkingTreeForStart": true
  }
}
```
