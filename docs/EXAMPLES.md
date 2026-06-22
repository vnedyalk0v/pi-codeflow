# Examples

These examples are starter `.pi/codeflow.json` files for projects that install
pi-codeflow. Copy the smallest one that fits, then adjust check commands to the
project's existing scripts.

Project configs are patches that merge over package defaults before validation.
These partial snippets omit `$schema` because the current schema describes the
resolved config after defaults are merged.

## Minimal project config

Use this when the project wants Codeflow defaults and has no local checks yet:

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

An empty `checks` array is allowed. `/flow-check` will report that no checks ran,
which should not be treated as verification evidence.

## Node app config

```json
{
  "baseBranches": {
    "default": "dev",
    "allowed": ["dev", "main"],
    "fallback": "main",
    "missingDefaultBehavior": "block"
  },
  "branching": {
    "defaultType": "chore"
  },
  "checks": [
    {
      "name": "lint",
      "command": "npm run lint",
      "timeoutMs": 120000
    },
    {
      "name": "typecheck",
      "command": "npm run typecheck",
      "timeoutMs": 120000
    },
    {
      "name": "test",
      "command": "npm test",
      "timeoutMs": 300000
    }
  ]
}
```

## Python service config

```json
{
  "baseBranches": {
    "default": "dev",
    "allowed": ["dev", "main"],
    "fallback": "main",
    "missingDefaultBehavior": "block"
  },
  "branching": {
    "defaultType": "chore"
  },
  "checks": [
    {
      "name": "ruff",
      "command": "ruff check .",
      "timeoutMs": 120000
    },
    {
      "name": "mypy",
      "command": "mypy .",
      "timeoutMs": 120000
    },
    {
      "name": "pytest",
      "command": "pytest",
      "timeoutMs": 300000
    }
  ]
}
```

## Monorepo config

```json
{
  "baseBranches": {
    "default": "dev",
    "allowed": ["dev", "main"],
    "fallback": "main",
    "missingDefaultBehavior": "block"
  },
  "checks": [
    {
      "name": "workspace lint",
      "command": "<workspace-tool> run lint --changed",
      "timeoutMs": 120000
    },
    {
      "name": "workspace tests",
      "command": "<workspace-tool> run test --changed",
      "timeoutMs": 300000
    },
    {
      "name": "workspace build",
      "command": "<workspace-tool> run build --changed",
      "required": false
    }
  ]
}
```

Replace `<workspace-tool>` with the monorepo tool already used by the project.
Do not add a new dependency only for Codeflow checks.

## Review-comments safe config

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

This keeps `/flow-comments` read-only and requires explicit
`/flow-fix-comments` apply flags before GitHub review-thread mutations.

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

Template paths are resolved from the repository root and then the package root.
Keep custom templates in the project and commit them with the config that
references them.

## GitHub checks defaults

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

These settings make PR creation conservative and make `/flow-watch` prefer
required checks by default.
