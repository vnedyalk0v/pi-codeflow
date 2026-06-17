# Implementation Plan After v0.1

The next implementation PR should stay small and target the first executable
foundation pieces.

## Recommended next PR

Target issues:

- #7 Implement config loader and validation.
- #8 Implement guidance injection.

## Suggested scope

- Add minimal extension scaffolding only when needed.
- Load package defaults.
- Load optional `.pi/codeflow.json` from the target project.
- Validate config against `schemas/codeflow.schema.json`.
- Surface clear validation errors.
- Inject concise Codeflow guidance that tells agents to follow the lifecycle and
  produce structured payloads.

## Non-goals for the next PR

- Branch creation.
- Running checks.
- Creating commits.
- Opening PRs.
- GitHub review comment automation.
- Runtime dependencies unless justified by implementation constraints.

## Verification expectations

- Unit tests for config loading and validation.
- Fixture configs for valid default, invalid branch type, missing template, and
  unsafe safety settings.
- Manual check that guidance remains model-neutral.
