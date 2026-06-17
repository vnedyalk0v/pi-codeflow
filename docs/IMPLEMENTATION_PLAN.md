# Implementation Plan After v0.1

The next implementation PR should stay small and target the first executable
foundation pieces.

## Current implementation PR

Target issue:

- #7 Implement config loader and validation.

This PR implements the v0.2 config foundation and keeps guidance injection out
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

## Non-goals for #7

- Guidance injection.
- Pi extension lifecycle hooks.
- Flow commands.
- Branch creation.
- Running checks.
- Creating commits.
- Opening PRs.
- GitHub review comment automation.

## Next intended implementation issue

#8 Implement guidance injection is the next intended implementation issue after
#7. It should consume the validated config layer rather than reimplementing
config resolution or schema validation.

## Verification expectations

- Unit tests for config loading and validation.
- Fixture configs for valid project config, invalid project config, and missing
  project config.
- Manual check that no guidance injection, Pi lifecycle hooks, flow commands, or
  workflow automation are introduced in #7.
