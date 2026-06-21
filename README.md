# pi-codeflow

Pi package for consistent AI coding workflows.

**Project status:** early implementation / pre-MVP.

> Warning: this repository is not ready for production use yet. It now contains
> config loading, validation, guidance injection, lifecycle state helpers,
> `/flow-start` semantic branch preparation, `/flow-check` local check running,
> `/flow-commit` generated commit messages, `/flow-pr` generated PR
> title/body creation, `/flow-watch` GitHub PR checks watching, read-only
> `/flow-comments` review-thread triage, and safe `/flow-fix-comments`
> review-thread reply/resolution gates, but it does not enforce the full
> workflow in real projects.

pi-codeflow is intended to guide Pi Coding Agent through a consistent coding
lifecycle:

- semantic branch creation
- implementation planning
- configured local checks
- self-review
- templated commits
- templated pull requests
- CI tracking with GitHub PR checks summaries
- reviewer comment triage
- fix loops
- final delivery reports

## What this package will do

- Provide model-neutral workflow guidance for AI coding agents.
- Inject proactive Codeflow guidance from validated configuration before agent
  runs.
- Standardize branch names, commit payloads, PR payloads, review replies, and
  final reports.
- Load project-specific workflow configuration from `.pi/codeflow.json`.
- Run configured local checks and summarize results.
- Help agents triage GitHub review comments read-only and apply safe
  `/flow-fix-comments` replies/resolution only after classification,
  verification, and policy gates pass.
- Keep safety rules visible, auditable, and conservative by default.

## What this package will not do

- Replace human product, security, or code review decisions.
- Force-push, delete branches, rewrite history, or perform destructive git
  operations by default.
- Require access to secrets for normal operation.
- Generate production implementation code without an issue and accepted plan.
- Hide model-specific instructions or depend on one model provider.

## Proposed command surface

| Command | Purpose |
| --- | --- |
| `/flow-start` | Classify a task and prepare a semantic work branch. |
| `/flow-plan` | Produce an implementation plan. |
| `/flow-status` | Show current lifecycle state. |
| `/flow-check` | Run configured checks. |
| `/flow-review` | Self-review the current diff. |
| `/flow-commit` | Render and create a commit from a structured payload. |
| `/flow-pr` | Render and open a templated pull request. |
| `/flow-watch` | Watch GitHub checks. |
| `/flow-comments` | Read-only review-thread listing, filtering, and triage validation. |
| `/flow-fix-comments` | Verified reply and policy-gated resolution for triaged review threads. |
| `/flow-report` | Produce a final delivery report. |

## Intended package structure

```text
pi-codeflow/
├── docs/          # product specs, workflow docs, release notes, decisions
├── src/           # TypeScript config loading and validation foundation
├── tests/         # unit tests and config fixtures
├── extensions/    # future Pi extension implementation entry points
├── skills/        # Pi skills that teach agents when to use Codeflow
├── prompts/       # prompt templates for lifecycle phases
├── templates/     # rendered output templates
├── config/        # default and example Codeflow configuration
├── schemas/       # draft JSON schemas for configuration and payloads
└── .github/       # PR template, issue forms, and future workflow docs
```

## Documentation

- [MVP specification](docs/MVP.md)
- [Product Requirements Document](docs/PRD.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Workflow](docs/WORKFLOW.md)
- [Lifecycle state machine](docs/STATE_MACHINE.md)
- [Configuration](docs/CONFIGURATION.md)
- [Branching](docs/BRANCHING.md)
- [Commits](docs/COMMITS.md)
- [Pull Requests](docs/PULL_REQUESTS.md)
- [Review Comments](docs/REVIEW_COMMENTS.md)
- [Emergency Flow](docs/EMERGENCY_FLOW.md)
- [Security Model](docs/SECURITY_MODEL.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)

## Development note

This repository now includes the first production foundations for configuration
loading, validation, guidance generation, before-agent guidance injection,
in-memory lifecycle state helpers, `/flow-start` semantic branch preparation,
`/flow-check` configured local check running, `/flow-commit` generated commit
messages from structured payloads, `/flow-pr` generated PR title/body creation
through GitHub CLI, `/flow-watch` GitHub PR checks watching, and read-only
`/flow-comments` review-thread listing, filtering, triage validation, summaries,
bounded session state, and `/flow-fix-comments` structured review-fix payload
validation, deterministic reply rendering, GitHub GraphQL reply/resolution
mutations behind explicit apply flags, safety policy, and bounded outcome state.

It still does not implement self-review automation, automatic code fixes from
review comments, merge automation, auto-approval, branch deletion, workflow
reruns, or persistent lifecycle storage beyond the minimal in-command
session-state result.
