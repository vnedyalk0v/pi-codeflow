# Examples

Project configs are patches that merge over package defaults before validation.
Copy the smallest example that fits, then adjust commands to match scripts that
already exist in the target project.

The maintained starter configs live in `config/`:

- `config/example.node.codeflow.json`: Node project starter with lint,
  typecheck, test, and optional build checks.
- `config/example.python.codeflow.json`: Python service starter with ruff, mypy,
  and pytest.
- `config/example.monorepo.codeflow.json`: monorepo starter for changed-workspace
  lint, tests, and optional build.

Use an empty `checks` array when a project has no local checks yet.
`/flow-check` reports `no_checks`; do not treat that as verification evidence.

Custom templates should live in the project repository and be committed with the
config that references them. Template paths resolve from the repository root and
then the package root.
