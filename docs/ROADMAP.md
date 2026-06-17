# Roadmap

## v0.1 Specification foundation

**Scope**

- Harden product, lifecycle, branching, commit, PR, configuration, and safety
  specifications.
- Align docs, config examples, schemas, prompts, templates, and agent guidance.
- Keep the repository implementation-free.

**Issues likely included**

- #1
- #2
- #3
- #4
- #5
- #6
- #16

**Deliverables**

- MVP spec.
- PRD.
- Workflow and state machine docs.
- Branching, commit, PR, config, emergency, and security specs.
- Conservative config examples and draft schemas.

**Non-goals**

- Production extension logic.
- Runtime dependencies.
- CI beyond lightweight validation.

## v0.2 Config loader and schema validation

**Scope**

- Implement default config loading.
- Implement `.pi/codeflow.json` loading.
- Implement optional `extends` resolution.
- Validate config with clear errors.

**Issues likely included**

- #7

**Deliverables**

- Config loader.
- Schema validator integration.
- Tests for valid and invalid config.

**Non-goals**

- Branch creation.
- GitHub PR automation.

## v0.3 Guidance injection and lifecycle state

**Scope**

- Inject active Codeflow guidance into agent context.
- Track lifecycle phase and task metadata.

**Issues likely included**

- #8

**Deliverables**

- Guidance engine.
- Basic state store.
- `/flow-status` behavior.

**Non-goals**

- Performing git commits or PR operations.

## v0.4 Semantic branch creation

**Scope**

- Classify task type.
- Render branch names.
- Create semantic branches from allowed base branches.
- Enforce reserved branch policy.

**Issues likely included**

- #9

**Deliverables**

- `/flow-start` implementation.
- Branch collision handling.
- Tests for reserved branch blocking.

**Non-goals**

- Commit rendering.
- PR creation.

## v0.5 Check runner and self-review

**Scope**

- Run configured checks in order.
- Capture check results.
- Prompt structured self-review.

**Issues likely included**

- #10

**Deliverables**

- `/flow-check` implementation.
- `/flow-review` prompt integration.
- Check result state.

**Non-goals**

- GitHub CI watcher.

## v0.6 Templated commits and PRs

**Scope**

- Validate structured commit and PR payloads.
- Render commit messages and PR bodies from templates.
- Create commits and open/update PRs.

**Issues likely included**

- #11
- #12

**Deliverables**

- `/flow-commit` implementation.
- `/flow-pr` implementation.
- Template renderer.

**Non-goals**

- Automated review comment fixes.
- Auto-merge.

## v0.7 GitHub checks and review comments loop

**Scope**

- Watch GitHub checks.
- List unresolved review comments.
- Classify comments.
- Guide fix loops and allowed resolution.

**Issues likely included**

- #13
- #14

**Deliverables**

- `/flow-watch` implementation.
- `/flow-comments` implementation.
- `/flow-fix-comments` guidance.

**Non-goals**

- Human approval replacement.
- Auto-resolving ambiguous comments.

## v0.8 Hardening and release readiness

**Scope**

- Add CI for implementation.
- Complete installation and usage docs.
- Harden security boundaries.
- Prepare release process.

**Issues likely included**

- #15
- #17

**Deliverables**

- Installation guide.
- Validation CI.
- Release checklist.
- Package readiness review.

**Non-goals**

- Automated publishing without explicit release design.
