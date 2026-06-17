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
