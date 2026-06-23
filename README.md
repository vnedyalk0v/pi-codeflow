# pi-codeflow

Pi package for consistent AI coding workflows.

## Project status

pi-codeflow is early and pre-release. Review the package source before installing
it in real projects. It is not published to npm, does not claim production
readiness, and does not automate merge or release authority.

## What Codeflow Does

Codeflow helps Pi Coding Agent follow a conservative repository lifecycle:

- inject workflow guidance before agent runs;
- prepare semantic branches with `/flow-start`;
- run project-configured checks with `/flow-check`;
- render and create commits from structured payloads with `/flow-commit`;
- render and open or update PRs from structured payloads with `/flow-pr`;
- read GitHub PR checks with `/flow-watch`;
- list and triage GitHub review threads read-only with `/flow-comments`;
- apply policy-gated review replies and resolutions with `/flow-fix-comments`.

## Command Lifecycle

```text
/flow-start
  -> implement focused changes
  -> /flow-check
  -> /flow-commit
  -> /flow-pr
  -> /flow-watch
  -> /flow-comments
  -> fix valid review findings
  -> /flow-check
  -> /flow-commit
  -> /flow-pr
  -> /flow-watch
  -> /flow-fix-comments
```

Human review and merge remain outside Codeflow.

## Installation

Current recommended installation paths are GitHub and local clone installs:

```sh
pi install https://github.com/vnedyalk0v/pi-codeflow
```

For project-local setup when supported by Pi:

```sh
pi install -l https://github.com/vnedyalk0v/pi-codeflow
```

See [Installation](docs/INSTALLATION.md) for pinned refs, temporary evaluation,
local clone installs, requirements, and verification.

## Quickstart

1. Install pi-codeflow.
2. Add `.pi/codeflow.json` to the target project.
3. Start work with `/flow-start --type feat "Add Google OAuth login"`.
4. Make focused changes with the agent.
5. Run `/flow-check`.
6. Commit through `/flow-commit --payload .pi/codeflow/commit-payload.json`.
7. Open a PR through `/flow-pr --payload .pi/codeflow/pr-payload.json`.
8. Watch checks with `/flow-watch --required`.
9. Triage review threads with `/flow-comments`.
10. Use `/flow-fix-comments` only after fixes and verification.

See [Usage](docs/USAGE.md) for the full end-to-end flow, command reference, and
payload examples.

## Configuration

Project configuration lives at:

```text
.pi/codeflow.json
```

See:

- [Configuration](docs/CONFIGURATION.md)
- [Branching](docs/BRANCHING.md)
- [Commits](docs/COMMITS.md)
- [Pull Requests](docs/PULL_REQUESTS.md)
- [Review Comments](docs/REVIEW_COMMENTS.md)

## Safety Model

Codeflow is conservative by default:

- no normal work on reserved branches;
- no force-push or destructive git operations;
- no PR approval or merge automation;
- no package publishing or deployment;
- no review-thread resolution for `needs_human`;
- GitHub mutations only through explicit commands and policy gates.

See [Security Model](docs/SECURITY_MODEL.md).

## Troubleshooting

See [Troubleshooting](docs/TROUBLESHOOTING.md) for missing packages, missing
commands, invalid config, GitHub CLI authentication, failed checks, PR failures,
and review-thread resolution blockers.

## Development and Validation

Install dependencies and run the package validation suite:

```sh
npm install
npm run check
```

Individual checks:

```sh
npm run typecheck
npm test
npm run check:json
npm run check:text
npm run check:docs
```

GitHub Actions runs the same package validation on PRs targeting `dev` or
`main`, and on pushes to `dev` or `main`.

## Limitations

- Early pre-release package.
- GitHub operations require GitHub CLI and authentication.
- Local checks execute commands from trusted project configuration.
- GitHub review-thread operations rely on GitHub GraphQL through `gh`.
- `/flow-fix-comments` replies or resolves review threads; it does not edit
  code.
- Branch protection, human review, merge approval, and release authority remain
  outside Codeflow.
- Self-review automation and final report command automation are future work.

## Documentation

- [Installation](docs/INSTALLATION.md)
- [Usage](docs/USAGE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Configuration](docs/CONFIGURATION.md)
- [Workflow](docs/WORKFLOW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security Model](docs/SECURITY_MODEL.md)
- [Release Process](docs/RELEASE_PROCESS.md)
- [Product Requirements Document](docs/PRD.md)
- [Lifecycle state machine](docs/STATE_MACHINE.md)
- [Emergency Flow](docs/EMERGENCY_FLOW.md)
