# ADR 0001: Scope pi-codeflow as a full AI coding workflow package

## Status

Accepted

## Context

A PR guard alone is too narrow. AI coding agents need guidance before the PR exists:

- task classification;
- branch selection;
- implementation planning;
- checks;
- self-review;
- commits;
- PR creation;
- CI tracking;
- review comment loops;
- final reporting.

## Decision

pi-codeflow owns the full coding lifecycle for Pi Coding Agent workflows. It
should provide extension behavior, skills, prompts, templates, schemas,
configuration, and documentation that work together.

## Consequences

- The repository includes extension, skills, prompts, templates, schemas, config, docs, and project management setup.
- MVP design must define lifecycle phases and state transitions.
- The package must be conservative because it can influence many agent actions.
- Implementation should remain incremental and issue-driven.
