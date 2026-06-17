# Architecture

pi-codeflow is intended to be a Pi package composed of extension code, skills,
prompts, templates, config, schemas, and documentation. Production
implementation is intentionally deferred until the v0.1 specification foundation
is reviewed.

## Components

| Component | Responsibility | Inputs | Outputs | Must not do |
| --- | --- | --- | --- | --- |
| Policy Engine | Own workflow rules such as branch policy, payload requirements, emergency rules, and safety settings. | Resolved config, lifecycle state, repository status. | Policy decisions, warnings, blockers. | Mutate git state directly. |
| Guidance Engine | Inject active Codeflow guidance into agent context. | Policy decisions, lifecycle phase, task metadata. | Agent instructions and next-step guidance. | Hide provider-specific instructions or bypass templates. |
| Tooling Layer | Expose future commands such as `/flow-start`, `/flow-check`, `/flow-commit`, `/flow-pr`, `/flow-comments`, and `/flow-report`. | User commands, agent payloads, state. | Tool results and state transitions. | Perform unsafe operations without policy approval. |
| Template Renderer | Render branch names, commit messages, PR bodies, review replies, and final reports. | Structured payloads and template files. | Rendered text artifacts. | Ask the model to freeform final outputs. |
| Git Integration | Inspect status, create branches, stage/commit changes, and read diffs. | Repository path, branch policy, commit payloads. | Branches, commits, git status summaries. | Force-push, discard changes, or work on reserved branches by default. |
| GitHub Integration | Open/update PRs, watch checks, list review comments, and apply allowed replies/resolutions. | PR payloads, GitHub CLI/API output, review policy. | PR URLs, CI summaries, comment triage. | Merge PRs or bypass human review. |
| State Store | Track lifecycle phase, task metadata, check results, payloads, and reports. | Tool results and guidance decisions. | Session state and status summaries. | Store secrets or transient state in repository files by default. |
| Safety Boundary | Block or warn about off-path actions. | Git state, config, command intent, lifecycle phase. | Blockers, warnings, required confirmations. | Replace proactive guidance as the main UX. |
| Config Loader | Load defaults, optional `extends`, and project `.pi/codeflow.json`. | Package defaults, project config files. | Resolved config object. | Mutate repository or run checks. |
| Schema Validator | Validate config and payloads. | JSON schemas, config, structured payloads. | Validation result with paths and messages. | Silently coerce unsafe values. |
| Skills | Teach agents when Codeflow applies and how to follow it. | User task and repository context. | Concise model-neutral guidance. | Contain production logic. |
| Prompts | Request structured payloads for lifecycle steps. | Task context, diffs, checks, comments. | Structured payload drafts. | Render final commit messages or PR bodies. |

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

v0.1 does not implement these components. It defines the contracts that future
implementation PRs should follow.
