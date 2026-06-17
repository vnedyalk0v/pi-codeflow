# Configuration

The project-level configuration file is `.pi/codeflow.json`. The v0.2
foundation loads package defaults, optionally loads project config, merges the
two layers, and validates the resolved config before future workflow commands
mutate repository state.

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

Command-specific overrides are reserved for a future milestone.

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
| `pullRequest` | PR template, base branch, draft, and self-review policy. |
| `checks` | Ordered local checks. |
| `reviewComments` | Review comment classifications and resolution policy. |
| `emergency` | Emergency override and hotfix policy. |
| `templates` | Named template paths. |
| `guidance` | Proactive guidance and structured-output behavior. |
| `safety` | Fallback safety boundaries. |

## Checks

`checks` is an ordered array. Codeflow must run checks in order and stop or
continue according to future policy. Each check includes:

- `name`
- `command`
- optional `cwd`
- optional `timeoutSeconds`

## Template resolution

Template paths are resolved from the repository root unless a future config key
explicitly changes the base directory. Missing templates should block rendering.

## Branch policy configuration

Branching config controls:

- allowed branch types;
- default branch type;
- branch name template;
- slug case;
- slug length;
- branch collision handling.

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
    "defaultType": "chore",
    "template": "templates/branch-name.md",
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
    "performCommit": true
  },
  "pullRequest": {
    "template": "templates/pull-request.md",
    "baseBranch": "dev",
    "draftByDefault": true,
    "requireSelfReview": true,
    "openWhenChecksFail": false,
    "updateExisting": true
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
