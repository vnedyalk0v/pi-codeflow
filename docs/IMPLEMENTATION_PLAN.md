# Implementation Plan After v0.1

Implementation PRs should stay small and target one executable foundation layer
at a time.

## Current implementation PR

Target issue:

- #10 Implement `/flow-check`.

This PR implements the v0.5 configured local check runner foundation. It consumes
the validated config layer from #7, guidance/lifecycle foundation from #8, and
semantic branch command foundation from #9, then adds ordered check execution,
result capture, failure summaries, and bounded latest check state. Self-review,
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

## Implemented #10 scope

- Add `/flow-check` command registration.
- Run configured checks in order from validated config.
- Capture status, exit code, signal, stdout, stderr, duration, and summaries.
- Support dry-run, stop-on-failure, continue-on-failure, timeout, optional
  checks, and empty-check behavior.
- Store latest bounded check results in Codeflow session-state output.
- Move failed required checks toward `fixing_local_findings`.
- Add tests and docs for check runner behavior.

## Non-goals for #10

- Self-review automation.
- Commit generation or commit execution.
- PR generation or PR opening.
- GitHub checks watcher.
- Review comment automation.
- Merge automation.
- Persistent external lifecycle storage.

## Next intended implementation issue

#11 Implement `/flow-commit` is the next numbered implementation issue after
#10. There is not currently a dedicated self-review issue; self-review remains
future work within or after v0.5 before Codeflow should claim full pre-commit
verification automation.

## Verification expectations

- Unit tests for config loading and validation.
- Unit tests for generated guidance and safe config-load failure behavior.
- Unit tests for lifecycle state creation and next expected actions.
- Unit tests for branch type inference, branch name rendering, branch policy,
  reserved branch behavior, base branch behavior, dirty tree protection, and the
  `/flow-start` command registration.
- Unit tests for ordered check execution, stdout/stderr capture, exit codes,
  durations, failure policy, timeouts, dry-run, empty-check behavior, summaries,
  command registration, lifecycle phase selection, and bounded state storage.
- Manual check that self-review, commit generation, PR generation, GitHub
  automation, review comment automation, and merge automation remain out of
  scope.
