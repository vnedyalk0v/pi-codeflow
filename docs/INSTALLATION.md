# Installation

## Project status

pi-codeflow is an early, pre-release Pi package. It is useful for evaluating the
implemented Codeflow workflow commands, but maintainers should review the source
before using it in real repositories.

The current package includes guidance injection and the implemented commands
documented in [Usage](USAGE.md). It does not claim production readiness, npm
publishing, merge automation, package publishing, or release automation.

## Requirements

- Pi Coding Agent installed.
- Git installed.
- Node.js and npm available for package dependencies and validation.
- GitHub CLI installed for GitHub-related commands.
- GitHub CLI authentication for PR, check, and review-thread operations.
- A trusted project repository before installing project-level packages.
- Source review before installing this package or any project-level Pi package.

Check GitHub CLI authentication with:

```sh
gh auth status
```

## Install from GitHub

Install directly from the GitHub repository:

```sh
pi install https://github.com/vnedyalk0v/pi-codeflow
```

For a reproducible install, pin a tag or commit:

```sh
pi install git:github.com/vnedyalk0v/pi-codeflow@<tag-or-commit>
```

Prefer a tag or commit pin for team and CI-like environments. Unpinned installs
may change as the repository changes.

## Install for one project

Install for the current project when Pi supports project-local package settings:

```sh
pi install -l https://github.com/vnedyalk0v/pi-codeflow
```

Project-local installation is intended for shared team setup. The `-l` option
writes to project settings when supported by Pi, and project packages may install
automatically on startup after the project is trusted.

Review package source before trusting project settings that install extensions.
Pi packages and extensions can execute code with local user permissions.

## Try without permanent install

Evaluate the package without permanently adding it:

```sh
pi -e https://github.com/vnedyalk0v/pi-codeflow
```

Use this for a quick trial in a test repository. Do not treat it as a stable
team setup because it does not pin or document a durable project configuration.

## Install from local clone

Clone and validate the package locally:

```sh
git clone https://github.com/vnedyalk0v/pi-codeflow.git
cd pi-codeflow
npm install
npm run check
pi install /absolute/path/to/pi-codeflow
```

If your Pi environment supports project-local relative paths, install the local
clone for one project from that project directory:

```sh
pi install -l ../pi-codeflow
```

Use an absolute path when sharing instructions across machines because relative
paths depend on each developer's checkout layout.

## npm package status

Do not install pi-codeflow from npm unless a future release process explicitly
publishes it there.

At the moment, GitHub or local-path installation is the recommended path. npm
installation is future work unless repository metadata and release notes say a
published package exists.

## Verify installation

Start with Pi package visibility:

```sh
pi list
```

Then verify only what your Pi version exposes:

- Check that package resources are listed for pi-codeflow.
- Check that Codeflow commands are visible if Pi exposes command listing.
- Start Pi in a trusted test repository and look for Codeflow guidance before
  the agent starts.
- Use dry-run command modes where available before mutating state.

Safe command examples after installation:

```text
/flow-start --dry-run --type docs "Document installation"
/flow-check --dry-run
/flow-pr --dry-run --payload .pi/codeflow/pr-payload.json
/flow-fix-comments --dry-run --payload .pi/codeflow/review-comment-fix.json
```

Dry-runs validate and preview behavior. They are not verification evidence that
checks passed or that GitHub was mutated.

## Next steps

- Read [Usage](USAGE.md) for the command lifecycle.
- Add project configuration from [Configuration](CONFIGURATION.md).
- Copy a starter config from [Examples](EXAMPLES.md).
- Keep [Troubleshooting](TROUBLESHOOTING.md) nearby for install and command
  issues.
