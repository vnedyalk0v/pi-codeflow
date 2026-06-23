# Examples

Project configs are patches that merge over package defaults before validation.
Copy the smallest example that fits, then adjust commands to match scripts that
already exist in the target project.

The maintained starter configs live in `config/`:

- `config/example.node.codeflow.json` for Node projects.
- `config/example.python.codeflow.json` for Python services.
- `config/example.monorepo.codeflow.json` for monorepos.

Use an empty `checks` array when a project has no local checks yet.
`/flow-check` reports `no_checks`; do not treat that as verification evidence.

Custom templates should live in the project repository and be committed with the
config that references them. Template paths resolve from the repository root and
then the package root.
