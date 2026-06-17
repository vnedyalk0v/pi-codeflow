# Configuration

The future project-level configuration file is `.pi/codeflow.json`. The bootstrap repository includes draft examples in `config/`.

## Top-level keys

### `reservedBranches`

Branches that AI agents must not use for normal direct work, such as `main`, `dev`, or `production`.

### `baseBranches`

Defines default and allowed base branches for new work.

### `branching`

Controls allowed branch types and branch name templates.

### `commits`

Controls commit payload requirements and the commit message template path.

### `pullRequest`

Controls PR title/body rendering, base branch defaults, and the PR template path.

### `checks`

An ordered list of local checks. Each check should include a name, command, and optional working directory.

### `reviewComments`

Controls review comment classification values and resolution rules.

### `emergency`

Controls emergency override behavior, including required reasons and final report requirements.

### `templates`

Maps logical output names to template paths.

## Example

See:

- `config/default.codeflow.json`
- `config/example.node.codeflow.json`
- `config/example.python.codeflow.json`
- `config/example.monorepo.codeflow.json`
