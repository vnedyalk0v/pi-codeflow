# v0.1 MVP Specification

## Purpose

v0.1 is the specification foundation for pi-codeflow. It defines the product
scope, workflow lifecycle, branch policy, structured payloads, configuration
shape, safety model, and planning boundaries needed before production extension
logic begins.

v0.1 is not a production implementation milestone.

## Deliverables

- A clear product requirements document.
- A dedicated lifecycle workflow and state machine.
- A semantic branch policy.
- Commit, PR, review reply, and final report payload specifications.
- Configuration documentation for future `.pi/codeflow.json` files.
- Conservative default and example configuration files.
- Draft JSON schemas for configuration and structured payloads.
- Prompt and template files aligned with the structured-payload model.
- Agent guidance that keeps future work issue-driven and docs-first.
- GitHub milestones that map initial issues to the planned roadmap.

## Non-goals

- Production TypeScript extension logic.
- Runtime dependencies.
- Build tooling beyond lightweight validation of existing JSON or Markdown.
- Automated package publishing.
- Full GitHub review-thread automation.
- Multi-forge support.
- Direct enforcement of GitHub branch protection settings.

## Decisions required before implementation starts

- Where Codeflow session state should live inside Pi runtime state.
- How the extension should expose commands versus tools.
- How template rendering should handle optional fields and empty arrays.
- How project config should be merged with default config.
- How GitHub CLI failures should be surfaced to the agent.
- How to test shell-command execution safely.
- Whether `dev` is required or merely the default base branch.

## Intentionally postponed

- Config loader implementation.
- Guidance injection implementation.
- Branch creation command implementation.
- Local check runner implementation.
- Templated commit and PR command implementation.
- GitHub CI watch and review comment automation.
- Release automation.

## Definition of done for v0.1

- The core lifecycle phases are named and documented.
- State transitions and retry paths are documented.
- Branch type, slug, reserved branch, and base branch policies are documented.
- Commit and PR payloads have matching docs, templates, and schemas.
- Configuration docs, examples, and schema describe the same top-level keys.
- Safety boundaries are explicit and conservative.
- Target issues are referenced by the PR but not closed prematurely.
- JSON files parse successfully.
- The repository remains pre-MVP and implementation-free.

## v0.1 issues

| Issue | Purpose |
| --- | --- |
| #1 | Define v0.1 MVP scope. |
| #2 | Finalize Codeflow lifecycle phases. |
| #3 | Define semantic branch policy. |
| #4 | Define commit payload and template. |
| #5 | Define PR payload and template. |
| #6 | Define configuration schema. |
| #16 | Define safety boundaries. |

## Later milestone issues

| Issue | Planned milestone |
| --- | --- |
| #7 | v0.2 Config loader and schema validation. |
| #8 | v0.3 Guidance injection and lifecycle state. |
| #9 | v0.4 Semantic branch creation. |
| #10 | v0.5 Check runner and self-review. |
| #11 | v0.6 Templated commits and PRs. |
| #12 | v0.6 Templated commits and PRs. |
| #13 | v0.7 GitHub checks and review comments loop. |
| #14 | v0.7 GitHub checks and review comments loop. |
| #15 | v0.8 Hardening and release readiness. |
| #17 | v0.8 Hardening and release readiness. |
