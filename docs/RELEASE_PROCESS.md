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

## Promotion merge policy

GitHub currently reports `mergeCommitAllowed: false`, so merge commits are not
enabled for this repository. Use the allowed promotion merge method chosen by
maintainers.

For promotion PRs:

1. Open the promotion PR from `dev` itself, or from a branch that preserves
   `dev` ancestry.
2. When a promotion is squash-merged, immediately sync `main` back into `dev`
   before opening the next promotion PR.
3. After syncing, verify tree equality:

   ```sh
   git fetch origin --prune
   git rev-parse origin/main^{tree}
   git rev-parse origin/dev^{tree}
   ```

   The tree hashes should match when branch content is aligned.
4. Do not rely only on commit counts because histories can differ while content
   matches.

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
