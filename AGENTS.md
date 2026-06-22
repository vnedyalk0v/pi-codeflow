# Agent Instructions

These rules apply to AI agents working in this repository.

## Branch policy

- Do not work directly on `main`, `master`, `dev`, `develop`, `stage`,
  `staging`, `release`, or `production` during normal work.
- Create branches from `dev` unless an issue or maintainer explicitly says
  otherwise.
- Use semantic branches:
  - `feat/`
  - `fix/`
  - `hotfix/`
  - `refactor/`
  - `perf/`
  - `docs/`
  - `test/`
  - `chore/`
  - `ci/`
  - `build/`
  - `revert/`
- Prefer small PRs with one clear purpose.

## Docs-first and issue-first workflow

- Behavior changes must update docs and schemas before implementation is merged.
- Production implementation work must have a linked issue.
- Do not add production extension logic in docs/spec-only PRs.
- Do not add dependencies without a documented rationale.
- Keep docs, prompts, templates, schemas, and issues consistent when behavior
  changes.
- Keep installation and usage docs updated when command behavior changes.
- Treat `docs/INSTALLATION.md` and `docs/USAGE.md` as user-facing source of
  truth for setup, commands, limitations, and examples.
- Do not claim npm publishing, package publishing, production readiness, release
  automation, deployment, or secrets unless the release process and repository
  state actually provide them.

## Structured outputs

- Do not invent branch, commit, PR, review reply, or final report formats.
- Agents provide structured payloads.
- Codeflow templates render final branch names, commit messages, PR bodies,
  review replies, and final reports.
- Avoid raw git workflow operations when Codeflow tools exist.

## Pull requests

- PRs should reference relevant issues with `Refs #123` unless the PR fully
  satisfies the issue acceptance criteria.
- Include verification and self-review notes in every PR.
- Do not close issues directly from the command line unless explicitly asked.

## Safety

- Safety boundaries are fallback protection, not the normal workflow.
- Stop and ask for a human decision when the task requires product, security,
  legal, credential, merge, or release authority.
- Do not run destructive git operations, force-push, or push directly to reserved
  branches unless the user explicitly approves an emergency path.

## Final reports

Final reports must include:

- changed files
- checks run and results
- related issues and PRs
- review comments addressed, if any
- decisions made
- known risks or follow-up work
