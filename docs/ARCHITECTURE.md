# Architecture

pi-codeflow is intended to be a Pi package composed of extension code, skills,
prompts, templates, config, schemas, and documentation. The v0.6 foundation
includes config loading, conservative merging, schema validation, proactive
guidance generation, before-agent guidance injection, a small lifecycle state
model, `/flow-start` semantic branch preparation, `/flow-check` local check
running, and `/flow-commit` generated commit messages.

## Components

### Policy Engine

- **Responsibility:** own workflow rules such as branch policy, payload
  requirements, emergency rules, and safety settings.
- **Inputs:** resolved config, lifecycle state, and repository status.
- **Outputs:** policy decisions, warnings, and blockers.
- **Must not:** mutate git state directly.

### Guidance Engine

- **Status:** implemented foundation in v0.3.
- **Responsibility:** generate proactive, model-neutral Codeflow guidance from
  the resolved config and inject it before agent runs.
- **Inputs:** resolved config, lifecycle phase, branch context, config metadata,
  and task/session context when available.
- **Outputs:** system prompt appendix, visible guidance message, summary of
  reserved branches, base branch, active phase, expected tools, and warnings.
- **Must not:** hide provider-specific instructions, mention a specific model,
  include secrets or local environment details, or bypass templates.

### Tooling Layer

- **Status:** `/flow-start` implemented foundation in v0.4; `/flow-check`
  implemented foundation in v0.5; `/flow-commit` implemented foundation in
  v0.6; later commands are future work.
- **Responsibility:** expose commands such as `/flow-start`, `/flow-check`,
  `/flow-commit`, `/flow-pr`, `/flow-comments`, and `/flow-report`.
- **Inputs:** user commands, agent payloads, and state.
- **Outputs:** tool results and state transitions.
- **Must not:** perform unsafe operations without policy approval.

### Template Renderer

- **Status:** branch template foundation exists in v0.4; commit message renderer
  foundation is implemented in v0.6. PR rendering remains future work in #12.
- **Responsibility:** render branch names, commit messages, PR bodies, review
  replies, and final reports.
- **Inputs:** structured payloads and template files.
- **Outputs:** rendered text artifacts.
- **Must not:** ask the model to freeform final outputs.

### Git Integration

- **Status:** safe branch-preparation subset implemented in v0.4; staged-change
  commit subset implemented in v0.6.
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

### Check Runner

- **Status:** implemented foundation in v0.5.
- **Responsibility:** run configured local checks sequentially, capture stdout,
  stderr, exit code, signal, duration, timeout status, and summaries.
- **Inputs:** resolved config `checks`, command cwd, dry-run flag, and failure
  policy flags.
- **Outputs:** `CodeflowCheckRunResult`, clear failure summaries, and bounded
  check-state updates.
- **Must not:** accept arbitrary user command arguments, run checks in parallel,
  commit, push, open PRs, or call GitHub automation.

### State Store

- **Status:** lifecycle state helper foundation exists in v0.3; bounded latest
  check state is returned by `/flow-check` in v0.5; bounded latest commit
  metadata is returned by `/flow-commit` in v0.6; persistent external storage is
  not implemented yet.
- **Responsibility:** track lifecycle phase, task metadata, check results,
  payloads, and reports in future milestones.
- **Inputs:** tool results and guidance decisions.
- **Outputs:** session state and status summaries.
- **Must not:** store secrets, unbounded stdout/stderr, or transient state in
  repository files by default.

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
3. Lifecycle helpers provide the active phase and next expected actions.
4. Guidance Engine tells the agent the current lifecycle expectations before the
   agent starts.
5. `/flow-check` uses the resolved config to run project-owned local checks.
6. The Check Runner summarizes pass, fail, timeout, dry-run, and no-check cases.
7. `/flow-commit` validates a structured commit payload and check-state policy.
8. The Commit Renderer creates the final commit message from the configured
   template.
9. Git integration commits staged changes through a message file.
10. State Store records phase, evidence, bounded check summaries, and bounded
    commit metadata.
11. Future PR and GitHub integrations perform approved remote operations.
12. Safety Boundary blocks off-path behavior when needed.

## Implementation boundary

v0.1 defined the contracts that future implementation PRs should follow. v0.2
implemented the config loader and config schema validator foundation. v0.3
implements the guidance generation and before-agent injection foundation plus a
minimal lifecycle state helper. v0.4 implements the first command layer and safe
semantic branch creation foundation through `/flow-start`. v0.5 implements the
configured local check runner foundation through `/flow-check`. v0.6 implements
the commit renderer and commit command foundation through `/flow-commit`.

Self-review automation, PR automation, persistent external lifecycle storage,
GitHub checks watching, review comment automation, and merge automation remain
future implementation work. `/flow-pr` and generated PR title/body rendering are
next in #12.
