# Config

Codeflow reads project configuration from `.pi/codeflow.json` and merges it
with `default.codeflow.json`.

Config files in this directory are examples for implementation work:

- `default.codeflow.json` defines conservative package defaults.
- `example.node.codeflow.json` sketches Node project settings.
- `example.python.codeflow.json` sketches Python project settings.
- `example.monorepo.codeflow.json` sketches monorepo project settings.

`checks` is an ordered array. Leave it empty when a repository has no local
checks yet. Add commands only after they exist in the target project. New config
should prefer `timeoutMs`; existing `timeoutSeconds` remains accepted for
compatibility.

`commits` controls `/flow-commit` payload validation, title length policy,
template rendering, staged-change commit execution, and latest-check policy. The
defaults require structured payloads, a body, verification, risk, and staged
changes while refusing reserved branches and failed checks by default.
