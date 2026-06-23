# Config

Codeflow reads project configuration from `.pi/codeflow.json` and merges it
with `default.codeflow.json`.

Config files in this directory are defaults and small project examples:

- `default.codeflow.json` defines conservative package defaults.
- `example.node.codeflow.json` sketches Node project overrides.
- `example.python.codeflow.json` sketches Python project overrides.
- `example.monorepo.codeflow.json` sketches monorepo project overrides.

`checks` is an ordered array. Leave it empty when a repository has no local
checks yet. Add commands only after they exist in the target project. New config
should prefer `timeoutMs`; existing `timeoutSeconds` remains accepted for
compatibility.

`commits` controls `/flow-commit` payload validation, title length policy,
template rendering, staged-change commit execution, and latest-check policy. The
defaults require structured payloads, a body, verification, risk, and staged
changes while refusing reserved branches and failed checks by default.

`pullRequest` controls `/flow-pr` payload validation, title/body templates, draft
behavior, base/head safety, feature-branch push behavior, existing PR updates,
and latest-check policy. The defaults require structured payloads,
verification, self-review, and draft PRs while refusing reserved head branches,
base=head PRs, and failed checks by default.

`reviewComments` declares the review-thread provider and safety policy. The
defaults prefer GitHub GraphQL, list unresolved threads, and keep auto-reply and
auto-resolution disabled.
