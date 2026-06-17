# Security Model

Pi packages can affect agent behavior. Extensions may execute code with the
user's local permissions. pi-codeflow must therefore be conservative by default.

> The package should prevent workflow mistakes by design. Safety boundaries exist
> for cases where an agent or tool attempts to leave the expected workflow.

## Proactive guidance vs fallback safety boundary

The normal user experience should guide agents into safe behavior:

- create semantic branches when that tooling is implemented;
- plan before editing;
- run configured checks when that tooling is implemented;
- provide structured payloads;
- render outputs from templates when renderers are implemented;
- ask humans for decisions when needed.

The v0.3 guidance injection foundation implements this as proactive before-agent
guidance. Safety boundaries are fallback protection. They should block or warn
when an agent tries to bypass the expected workflow, but they should not be the
primary way users experience Codeflow.

## Reserved branch safety

AI agents must not perform normal work directly on Codeflow-reserved branches,
including `main`, `master`, `dev`, `develop`, `stage`, `staging`, `release`, and
`production`.

This applies even when GitHub does not enforce branch protection. Local workflow
safety must not depend on remote settings being present or current.

## Destructive git operations

Destructive operations are disabled by default, including:

- deleting branches that may contain work;
- resetting or cleaning untracked user changes;
- rewriting history;
- force-pushing;
- discarding files without explicit approval.

If a future implementation supports any destructive operation, it must require an
explicit user request, a documented reason, and a final report.

## Direct push behavior

Normal flow should push feature branches only when opening or updating PRs.
Direct pushes to reserved branches are outside normal scope.

## Force push behavior

Force push is disabled by default. If a user explicitly asks for a force push,
Codeflow should stop, explain the risk, require confirmation, and record the
reason in the final report.

## Emergency override rules

Emergency flow requires:

- explicit user-provided reason;
- preference for `hotfix/` branch over reserved-branch work;
- structured commit payloads;
- structured PR payloads;
- verification evidence;
- final report;
- follow-up backport or cherry-pick notes for `dev` when applicable.

## No secret access by default

Codeflow should not require secrets for normal operation. It should avoid reading
secret files and should redact likely tokens in check output, reports, PR bodies,
and issue comments.

## Model neutrality

Codeflow should not depend on one model provider, hidden provider-specific
instructions, or provider-specific output quirks. Prompts should request simple
structured payloads that any capable coding model can produce.

## Human decision boundaries

Codeflow must stop for human input when work requires:

- product prioritization;
- security risk acceptance;
- legal or compliance judgment;
- credential handling;
- merge approval;
- release approval;
- ambiguous reviewer intent.

## What the extension should not automate

The extension should not automatically:

- approve or merge PRs;
- bypass branch protection;
- resolve invalid review comments without policy support;
- publish packages;
- rotate or inspect secrets;
- rewrite public history;
- make product or security decisions on behalf of maintainers.

## Extension risks

Future extension code may interact with git, GitHub CLI, local checks, and
session state. Any code that shells out, changes repository state, or expands
permissions must be documented, reviewed, and tested.

## Data handling

Codeflow should avoid storing sensitive data in rendered reports, issue comments,
logs, or session state. Check output should be summarized carefully when it might
include secrets.
