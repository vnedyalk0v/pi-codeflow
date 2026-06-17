# Implementation Plan After v0.1

Implementation PRs should stay small and target one executable foundation layer
at a time.

## Current implementation PR

Target issue:

- #9 Implement `/flow-start` and semantic branch creation.

This PR implements the v0.4 semantic branch creation foundation. It consumes the
validated config layer from #7 and guidance/lifecycle foundation from #8, then
adds the first safe workflow-mutating command. Check running, self-review,
commit generation, PR generation, GitHub checks watching, and review comment
automation remain out of scope.

## Implemented #7 scope

- Add minimal TypeScript project foundation.
- Load package defaults from `config/default.codeflow.json`.
- Load optional `.pi/codeflow.json` from the target project.
- Merge project config over defaults with conservative semantics.
- Validate the resolved config against `schemas/codeflow.schema.json`.
- Surface clear typed load and validation errors.
- Add unit tests for default loading, project loading, merge behavior, schema
  validation, and conditional fallback requirements.

## Implemented #8 scope

- Build Codeflow guidance from loaded config.
- Inject guidance with Pi `before_agent_start`.
- Provide a safe warning path when config loading fails.
- Add a minimal lifecycle phase and state helper foundation.
- Return next expected actions for lifecycle phases.
- Add unit tests for guidance, lifecycle behavior, and extension injection.
- Update docs for the implemented v0.3 scope.

## Implemented #9 scope

- Add `/flow-start` command registration.
- Add deterministic branch type inference and explicit type validation.
- Render semantic branch names from config/template rules.
- Detect tickets from `branching.ticketPattern` or explicit `--ticket`.
- Select base branches from configured policy, preferring `origin/<base>`.
- Prevent dirty working tree branch preparation.
- Keep reserved branches out of normal Codeflow work branches.
- Return lifecycle phase `branch_prepared` with next expected actions.
- Add tests for branching, command behavior, git integration, and safety cases.

## Non-goals for #9

- `/flow-check` implementation.
- Self-review automation.
- Commit generation or commit execution.
- PR generation or PR opening.
- GitHub checks watcher.
- Review comment automation.
- Persistent lifecycle storage.

## Next intended implementation issue

#10 Implement `/flow-check` is the next intended implementation issue after #9.
It should build on the prepared branch and lifecycle state result from
`/flow-start` rather than reimplementing config resolution or branch policy.

## Verification expectations

- Unit tests for config loading and validation.
- Unit tests for generated guidance and safe config-load failure behavior.
- Unit tests for lifecycle state creation and next expected actions.
- Unit tests for branch type inference, branch name rendering, branch policy,
  reserved branch behavior, base branch behavior, dirty tree protection, and the
  `/flow-start` command registration.
- Manual check that `/flow-check`, self-review, commit generation, PR generation,
  GitHub automation, and review comment automation remain out of scope.
