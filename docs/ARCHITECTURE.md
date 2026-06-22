# Architecture

pi-codeflow is intended to be a Pi package composed of extension code, skills,
prompts, templates, config, schemas, and documentation. The v0.7 foundation
includes config loading, conservative merging, schema validation, proactive
guidance generation, before-agent guidance injection, a small lifecycle state
model, `/flow-start` semantic branch preparation, `/flow-check` local check
running, `/flow-commit` generated commit messages, `/flow-pr` generated PR
title/body creation, `/flow-watch` GitHub PR checks watching, read-only
`/flow-comments` review-thread triage, and safe `/flow-fix-comments`
review-thread reply/resolution gates.

User-facing setup and command guidance lives in [Installation](INSTALLATION.md)
and [Usage](USAGE.md). Configuration examples live in [Examples](EXAMPLES.md).

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
  v0.6; `/flow-pr` implemented foundation in v0.6; `/flow-watch` implemented
  foundation in v0.7; `/flow-comments` read-only review triage implemented
  foundation in v0.7; `/flow-fix-comments` safe reply/resolution implemented
  foundation in v0.7; later report commands are future work.
- **Responsibility:** expose commands such as `/flow-start`, `/flow-check`,
  `/flow-commit`, `/flow-pr`, `/flow-watch`, `/flow-comments`,
  `/flow-fix-comments`, and `/flow-report`.
- **Inputs:** user commands, agent payloads, and state.
- **Outputs:** tool results and state transitions.
- **Must not:** perform unsafe operations without policy approval.

### Template Renderer

- **Status:** branch template foundation exists in v0.4; commit message renderer
  foundation is implemented in v0.6. PR title/body rendering foundation is
  implemented in v0.6 for #12.
- **Responsibility:** render branch names, commit messages, PR bodies, review
  replies, and final reports.
- **Inputs:** structured payloads and template files.
- **Outputs:** rendered text artifacts.
- **Must not:** ask the model to freeform final outputs.

### Git Integration

- **Status:** safe branch-preparation subset implemented in v0.4; staged-change
  commit subset implemented in v0.6; safe feature-branch push support added for
  `/flow-pr` in v0.6.
- **Responsibility:** inspect status, create branches, commit staged changes,
  compare refs, push the current feature branch when policy allows, and read
  diffs.
- **Inputs:** repository path, branch policy, commit payloads, and PR base/head
  policy.
- **Outputs:** branches, commits, pushed feature refs, and git status summaries.
- **Must not:** force-push, discard changes, delete branches, or work on
  reserved branches by default.

### GitHub Integration

- **Status:** PR creation/update foundation is implemented in v0.6 for #12;
  GitHub checks watching is implemented in v0.7 for #13. Read-only review
  comment triage and safe review-thread replies/resolution are implemented in
  v0.7 for #14; automatic review-fix editing remains future work.
- **Responsibility:** open/update PRs, watch GitHub PR checks, list review
  threads read-only, and apply allowed replies/resolutions through explicit
  `/flow-fix-comments` policy gates.
- **Inputs:** PR payloads, PR check rows, GitHub CLI/API output, GraphQL review
  thread data, and review policy.
- **Outputs:** PR URLs, bounded PR metadata, CI summaries, bounded GitHub
  checks metadata, read-only review-thread summaries, bounded review-comment
  triage state, and bounded review-fix outcome state.
- **Review-thread provider:** prefer `gh api graphql` for review threads because
  GraphQL exposes thread IDs, resolved state, and outdated state. Do not add
  Octokit for the initial implementation.
- **Must not:** merge PRs, approve PRs, resolve reviewer comments without
  policy, resolve threads before checks pass, mass-resolve bot comments, rerun
  workflows, mutate review comments from `/flow-comments`, bypass
  `/flow-fix-comments` policy gates, mass-resolve comments, or bypass human
  review.

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
  metadata is returned by `/flow-commit` in v0.6; bounded latest PR metadata is
  returned by `/flow-pr` in v0.6; bounded latest GitHub checks metadata is
  returned by `/flow-watch` in v0.7; bounded latest review-comment and
  review-fix metadata is returned by `/flow-comments` and `/flow-fix-comments`
  in v0.7; persistent external storage is not implemented yet.
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

### User Documentation

- **Responsibility:** explain installation, configuration, command usage,
  examples, troubleshooting, limitations, and safety boundaries for users and
  future agents.
- **Inputs:** implemented command behavior, schemas, prompts, templates, and
  release status.
- **Outputs:** README navigation plus `docs/INSTALLATION.md`, `docs/USAGE.md`,
  `docs/EXAMPLES.md`, and `docs/TROUBLESHOOTING.md`.
- **Must not:** claim npm publishing, production readiness, merge automation,
  or commands that are not implemented.

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
10. `/flow-pr` validates a structured PR payload, renders the PR title/body,
    applies branch and check-state policy, pushes the feature branch when
    configured, and calls GitHub CLI with explicit PR arguments.
11. `/flow-watch` resolves the target PR, calls `gh pr checks`, normalizes check
    status, and summarizes pending, passed, failed, skipped, cancelled,
    timed-out, no-checks, and unknown outcomes.
12. State Store records phase, evidence, bounded check summaries, bounded commit
    metadata, bounded PR metadata, and bounded GitHub checks metadata.
13. `/flow-comments` reads GitHub review threads with `gh api graphql`,
    normalizes thread/comment data, validates optional structured triage
    payloads, filters and summarizes threads, and stores bounded triage state
    without mutation.
14. `/flow-fix-comments` uses stored triage state, local checks, commit
    evidence, and GitHub check evidence before any reply or resolution.
15. Safety Boundary blocks off-path behavior when needed.

## Implementation boundary

v0.1 defined the contracts that future implementation PRs should follow. v0.2
implemented the config loader and config schema validator foundation. v0.3
implements the guidance generation and before-agent injection foundation plus a
minimal lifecycle state helper. v0.4 implements the first command layer and safe
semantic branch creation foundation through `/flow-start`. v0.5 implements the
configured local check runner foundation through `/flow-check`. v0.6 implements
the commit renderer and commit command foundation through `/flow-commit`, plus
the PR renderer and PR command foundation through `/flow-pr`. v0.7 implements the
read-only GitHub checks watcher foundation through `/flow-watch`, the read-only
review comments triage foundation through `/flow-comments`, and safe
review-comment reply/resolution through `/flow-fix-comments`.

Self-review automation, persistent external lifecycle storage, automatic review
fix editing, and merge automation remain future implementation work. Merge
automation, auto-approval, branch deletion, workflow reruns, and mass-resolution
remain out of scope.
