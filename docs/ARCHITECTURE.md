# Architecture

pi-codeflow is intended to be a Pi package composed of extension code, skills,
prompts, templates, config, schemas, and documentation. The v0.2 foundation
starts production implementation with config loading, conservative merging, and
schema validation.

## Components

### Policy Engine

- **Responsibility:** own workflow rules such as branch policy, payload
  requirements, emergency rules, and safety settings.
- **Inputs:** resolved config, lifecycle state, and repository status.
- **Outputs:** policy decisions, warnings, and blockers.
- **Must not:** mutate git state directly.

### Guidance Engine

- **Responsibility:** inject active Codeflow guidance into agent context.
- **Inputs:** policy decisions, lifecycle phase, and task metadata.
- **Outputs:** agent instructions and next-step guidance.
- **Must not:** hide provider-specific instructions or bypass templates.

### Tooling Layer

- **Responsibility:** expose future commands such as `/flow-start`,
  `/flow-check`, `/flow-commit`, `/flow-pr`, `/flow-comments`, and
  `/flow-report`.
- **Inputs:** user commands, agent payloads, and state.
- **Outputs:** tool results and state transitions.
- **Must not:** perform unsafe operations without policy approval.

### Template Renderer

- **Responsibility:** render branch names, commit messages, PR bodies, review
  replies, and final reports.
- **Inputs:** structured payloads and template files.
- **Outputs:** rendered text artifacts.
- **Must not:** ask the model to freeform final outputs.

### Git Integration

- **Responsibility:** inspect status, create branches, stage/commit changes,
  and read diffs.
- **Inputs:** repository path, branch policy, and commit payloads.
- **Outputs:** branches, commits, and git status summaries.
- **Must not:** force-push, discard changes, or work on reserved branches by
  default.

### GitHub Integration

- **Responsibility:** open/update PRs, watch checks, list review comments, and
  apply allowed replies/resolutions.
- **Inputs:** PR payloads, GitHub CLI/API output, and review policy.
- **Outputs:** PR URLs, CI summaries, and comment triage.
- **Must not:** merge PRs or bypass human review.

### State Store

- **Responsibility:** track lifecycle phase, task metadata, check results,
  payloads, and reports.
- **Inputs:** tool results and guidance decisions.
- **Outputs:** session state and status summaries.
- **Must not:** store secrets or transient state in repository files by default.

### Safety Boundary

- **Responsibility:** block or warn about off-path actions.
- **Inputs:** git state, config, command intent, and lifecycle phase.
- **Outputs:** blockers, warnings, and required confirmations.
- **Must not:** replace proactive guidance as the main UX.

### Config Loader

- **Status:** implemented in the v0.2 foundation.
- **Responsibility:** load defaults and project `.pi/codeflow.json`, then merge
  project values over defaults.
- **Inputs:** package defaults and project config files.
- **Outputs:** resolved config object with config path metadata.
- **Must not:** mutate repository, resolve `extends`, inject guidance, or run
  checks.

### Schema Validator

- **Status:** config validation is implemented in the v0.2 foundation.
- **Responsibility:** validate config and payloads.
- **Inputs:** JSON schemas, config, and structured payloads.
- **Outputs:** validation result with paths, messages, keywords, and allowed
  values when available.
- **Must not:** silently coerce unsafe values or expose raw validator errors.

### Skills

- **Responsibility:** teach agents when Codeflow applies and how to follow it.
- **Inputs:** user task and repository context.
- **Outputs:** concise model-neutral guidance.
- **Must not:** contain production logic.

### Prompts

- **Responsibility:** request structured payloads for lifecycle steps.
- **Inputs:** task context, diffs, checks, and comments.
- **Outputs:** structured payload drafts.
- **Must not:** render final commit messages or PR bodies.

## Data flow

1. Config Loader reads defaults and project config.
2. Schema Validator validates the resolved config.
3. Policy Engine derives allowed actions.
4. Guidance Engine tells the agent the current lifecycle expectations.
5. Tooling Layer receives commands and structured payloads.
6. Git and GitHub integrations perform approved operations.
7. Template Renderer creates final user-visible artifacts.
8. State Store records phase, evidence, and output summaries.
9. Safety Boundary blocks off-path behavior when needed.

## Implementation boundary

v0.1 defined the contracts that future implementation PRs should follow. v0.2
implements only the config loader and config schema validator foundation.
Guidance injection, lifecycle hooks, flow commands, git automation, and GitHub
automation remain future implementation work.
