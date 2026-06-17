# Release Process

The release process is planned for a future milestone.

1. Merge release-ready work from `dev` to `main`.
2. Update `CHANGELOG.md`.
3. Bump `package.json` version.
4. Create an annotated tag.
5. Create a GitHub release with highlights, migration notes, and known limitations.
6. Package publishing may be added later; it is not part of the bootstrap.

No automated publishing should be added until implementation, CI, and security review are ready.
