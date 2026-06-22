# Release Process

The release process is planned for a future milestone.

1. Merge release-ready work from `dev` to `main`.
2. Update `CHANGELOG.md`.
3. Bump `package.json` version.
4. Create an annotated tag.
5. Create a GitHub release with highlights, migration notes, and known limitations.
6. Package publishing may be added later; it is not part of the bootstrap.

CI validation should pass before merging feature work into `dev` and before
promoting `dev` to `main`.

No automated publishing should be added until implementation, CI, and security
review are ready.

## Release gates

Before publishing is automated, maintainers should confirm:

- implementation code exists and is covered by CI;
- the Validate workflow passes for the release or promotion PR;
- package contents are reviewed for secrets and generated artifacts;
- release notes describe compatibility and migration expectations;
- rollback instructions are documented for failed releases.

## Pre-release documentation checklist

Before a pre-release is tagged or promoted, confirm:

- installation docs are updated;
- usage docs are updated;
- troubleshooting docs are updated;
- CI is passing;
- no secrets are needed for package validation;
- no npm publishing is claimed unless explicitly planned and implemented;
- limitations and project status still match the current implementation.
