# pi-codeflow
Pi package for consistent AI coding workflows.

**Project status: planning / pre-MVP.**

> Warning: this repository is not ready for production use yet. It currently contains planning documents, templates, schemas, and project setup only. Do not rely on it to enforce workflow safety in real projects.

pi-codeflow is intended to guide Pi Coding Agent through a consistent coding lifecycle:

- semantic branch creation
- implementation planning
- configured checks
- self-review
- templated commits
- templated pull requests
- CI tracking
- reviewer comment triage
- fix loops
- final delivery reports

## What this package will do

- Provide model-neutral workflow guidance for AI coding agents.
- Standardize branch names, commit payloads, PR payloads, review replies, and final reports.
- Load project-specific workflow configuration from a future `.pi/codeflow.json` file.
- Run configured local checks and summarize results.
- Help agents triage GitHub review comments and only resolve comments that were addressed or proven stale.
- Keep safety rules visible, auditable, and conservative by default.

## What this package will not do

- Replace human product, security, or code review decisions.
- Force-push, delete branches, rewrite history, or perform destructive git operations by default.
- Require access to secrets for normal operation.
- Generate production implementation code without an issue and accepted plan.
- Hide model-specific instructions or depend on one model provider.

## Proposed command surface

- `/flow-start` — classify a task and prepare branch metadata.
- `/flow-plan` — produce an implementation plan.
- `/flow-status` — show current lifecycle state.
- `/flow-check` — run configured checks.
- `/flow-review` — self-review the current diff.
- `/flow-commit` — render a commit from a structured payload.
- `/flow-pr` — render and open a templated pull request.
- `/flow-watch` — watch GitHub checks.
- `/flow-comments` — list unresolved reviewer comments.
- `/flow-fix-comments` — fix valid reviewer comments.
- `/flow-report` — produce a final delivery report.

## Intended package structure

```text
pi-codeflow/
├── docs/          # product specs, workflow docs, release notes, decisions
├── extensions/    # future Pi extension implementation entry points
├── skills/        # Pi skills that teach agents when to use Codeflow
├── prompts/       # prompt templates for lifecycle phases
├── templates/     # rendered output templates
├── config/        # default and example Codeflow configuration
├── schemas/       # draft JSON schemas for configuration and payloads
└── .github/       # PR template, issue forms, and future workflow docs
```

## Documentation

- [Product Requirements Document](docs/PRD.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Workflow](docs/WORKFLOW.md)
- [Security Model](docs/SECURITY_MODEL.md)

## Development note

This repository intentionally does not include production extension logic yet. The first milestone is to agree on scope, behavior, safety boundaries, and project management before implementation begins.
