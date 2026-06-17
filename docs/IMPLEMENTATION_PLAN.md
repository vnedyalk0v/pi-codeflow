# Implementation Plan After v0.1

Implementation PRs should stay small and target one executable foundation layer
at a time.

## Current implementation PR

Target issue:

- #8 Implement guidance injection.

This PR implements the v0.3 guidance injection foundation. It consumes the
validated config layer from #7 and keeps flow commands and workflow mutations out
of scope.

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

## Non-goals for #8

- `/flow-start` implementation.
- Semantic branch creation.
- Check runner.
- Commit generation or commit execution.
- PR generation or PR opening.
- GitHub checks watcher.
- Review comment automation.
- Persistent lifecycle storage.

## Next intended implementation issue

#9 Implement `/flow-start` and semantic branch creation is the next intended
implementation issue after #8. It should build on guidance injection and the
lifecycle state foundation rather than reimplementing config resolution.

## Verification expectations

- Unit tests for config loading and validation.
- Unit tests for generated guidance and safe config-load failure behavior.
- Unit tests for lifecycle state creation and next expected actions.
- Unit tests for the before-agent injection helper without requiring a real Pi
  runtime.
- Manual check that `/flow-start`, semantic branch creation, check running,
  commit generation, PR generation, and GitHub automation remain out of scope.
