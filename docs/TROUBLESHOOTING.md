# Troubleshooting

## Pi package does not load

1. Run:

   ```sh
   pi list
   ```

2. Verify the install source is the expected GitHub URL, pinned ref, or local
   path.

3. Verify the project is trusted before relying on project-level packages.

4. Verify package resources in `package.json`:

   - `extensions`
   - `skills`
   - `prompts`

5. Verify these package directories exist:

   - `extensions/`
   - `skills/`
   - `prompts/`
   - `templates/`
   - `config/`
   - `schemas/`

6. From a local clone, run:

   ```sh
   npm install
   npm run check
   ```

## Codeflow commands are missing

- Check that pi-codeflow is installed with `pi list`.
- Restart Pi so package extensions are loaded again.
- Check for extension loading errors in Pi output.
- Validate the local package clone with `npm run check`.
- Confirm your Pi version exposes extension commands.

Implemented commands are:

- `/flow-start`
- `/flow-check`
- `/flow-commit`
- `/flow-pr`
- `/flow-watch`
- `/flow-comments`
- `/flow-fix-comments`

## Config not found

Codeflow searches for `.pi/codeflow.json` from the current project directory
upward. If no project config exists, it falls back to
`config/default.codeflow.json` from the package.

An explicit config path is supported by the internal config loader, but the
implemented user commands normally use the project search behavior.

Create:

```text
.pi/codeflow.json
```

Start from [Configuration](CONFIGURATION.md#starter-examples) and keep the
file committed with the project.

## Invalid config

Codeflow validates the merged default and project config with
`schemas/codeflow.schema.json`, then applies semantic safety checks.

Common errors:

- missing `baseBranches.default`;
- invalid branch type outside the allowed type list;
- `baseBranches.missingDefaultBehavior` set to `fallback` without
  `baseBranches.fallback`;
- `pullRequest.baseBranch` outside `baseBranches.allowed`;
- malformed `checks` entry;
- unknown config keys.

Fix the JSON, then rerun the command that failed. For a package clone, run:

```sh
npm run check:json
```

## GitHub CLI not authenticated

Run:

```sh
gh auth status
```

GitHub operations need an authenticated GitHub CLI session. This affects
`/flow-pr`, `/flow-watch`, `/flow-comments`, and `/flow-fix-comments`.

## `/flow-start` refuses dirty working tree

`/flow-start` checks `git status` before preparing a branch. With the default
safety config, staged, unstaged, or untracked changes block branch preparation.

Commit, stash, or otherwise handle the existing changes deliberately. Codeflow
does not run destructive cleanup, force checkout, or auto-stash.

## `/flow-check` fails

- Read the failure summary.
- Run the failing command manually if more output is needed.
- Fix the underlying issue.
- Rerun `/flow-check`.

Optional checks can fail without failing the whole run. Required check failures
block the flow until fixed or explicitly accepted by the user.

## `/flow-commit` refuses to commit

Common causes:

- no staged changes;
- current branch is reserved, such as `main` or `dev`;
- commit payload is missing or invalid;
- latest check state failed and unverified commits are not allowed;
- configured template cannot be read.

Stage only the intended files, rerun checks when needed, then retry with a valid
payload:

```text
/flow-commit --payload .pi/codeflow/commit-payload.json
```

## `/flow-pr` cannot open PR

Check:

- GitHub CLI authentication;
- current branch is not reserved;
- base branch exists on the remote;
- base and head are different;
- head branch can be pushed or already exists remotely;
- no existing PR conflicts with project policy;
- PR payload is valid;
- latest local check policy allows PR creation.

Use dry-run first when diagnosing payload or policy issues:

```text
/flow-pr --dry-run --payload .pi/codeflow/pr-payload.json
```

## `/flow-watch` finds no checks

Possible causes:

- the repository has no GitHub Actions or required checks;
- checks have not started yet;
- required-only mode filters out optional checks;
- the selected PR is not the PR you expected.

Try:

```text
/flow-watch --all
/flow-watch --watch --timeout 600
```

No checks is not passing verification. Treat it as missing remote evidence.

## `/flow-comments` finds no review threads

Possible causes:

- reviewers have not left inline review comments;
- comments are already resolved;
- comments are outdated and excluded by default;
- filters excluded the threads;
- the selected PR is not the expected PR.

Try:

```text
/flow-comments --all
/flow-comments --include-outdated
/flow-comments --pr 123
```

`/flow-comments` reads inline pull request review threads. It does not inspect
ordinary top-level PR issue comments in the current implementation.

## `/flow-fix-comments` blocks resolution

Resolution is intentionally conservative. Common blockers:

- required checks have not passed;
- latest GitHub check state failed, skipped, timed out, or is unknown;
- latest `/flow-comments` scan is incomplete or stale;
- payload thread IDs do not match latest triage state;
- `needs_human` classification is present;
- `invalid` classification is not resolvable by default;
- explicit apply flags were not used;
- `resolveRequested` is false.

Preview first:

```text
/flow-fix-comments --dry-run --payload .pi/codeflow/review-comment-fix.json
```

Apply only when the dry-run shows the intended replies or resolutions:

```text
/flow-fix-comments --apply --payload .pi/codeflow/review-comment-fix.json
```
