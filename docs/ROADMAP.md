# Roadmap

## v0.1 Repo foundation and specs

- Create repository foundation, docs, templates, schemas, issue forms, labels, and initial issues.
- Define MVP scope and non-goals.
- Keep production extension logic out of the bootstrap.

## v0.2 Guidance engine and config loader

- Load default config and `.pi/codeflow.json`.
- Validate config with clear errors.
- Inject active workflow guidance into agent context.

## v0.3 Semantic branching and state

- Implement task classification and branch metadata.
- Render semantic branch names.
- Track lifecycle state in session data.

## v0.4 Check runner and self-review prompts

- Run configured checks in order.
- Store check results.
- Prompt structured self-review against current diff.

## v0.5 Templated commits and PRs

- Request structured commit and PR payloads.
- Render commit messages and PR bodies from templates.
- Open PRs against configured base branches.

## v0.6 GitHub checks and review comments loop

- Watch GitHub checks.
- List unresolved review threads.
- Classify comments and guide fix loops.
- Resolve addressed or stale comments only after verification.

## v0.7 Hardening, docs, and release readiness

- Add tests and CI.
- Finalize security boundaries.
- Complete installation and usage docs.
- Prepare release process and package publishing plan.
