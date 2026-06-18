# Security Model

Pi packages can affect agent behavior. Extensions may execute code with the
user's local permissions. pi-codeflow must therefore be conservative by default.

> The package should prevent workflow mistakes by design. Safety boundaries exist
> for cases where an agent or tool attempts to leave the expected workflow.

## Proactive guidance vs fallback safety boundary

The normal user experience should guide agents into safe behavior:

- create semantic branches with `/flow-start`;
- plan before editing;
- run configured checks with `/flow-check`;
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

`/flow-pr` only pushes the current branch to the matching remote branch when
`pullRequest.pushBeforeCreate` or `--push` is active. It refuses to push reserved
branches and never force-pushes.

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

## Pull request execution

`/flow-pr` opens or updates pull requests from structured payloads only. It
renders the final title/body from Codeflow templates and calls GitHub CLI with
explicit `--base`, `--head`, `--title`, and `--body-file` arguments.

Safety expectations for PRs:

- never use `gh pr create --fill`;
- refuse normal PRs from reserved head branches;
- refuse base=head PRs;
- use `Refs` linked issues by default, not automatic closing keywords;
- warn about uncommitted changes because they are not in the PR until committed;
- block failed latest check state by default;
- warn when latest commit state is missing;
- push only the current feature branch to its matching remote branch;
- never force-push, merge, approve, request reviews, resolve comments, watch CI,
  or delete branches.

Reviewers should focus on deterministic rendering, branch/base safety, GitHub
CLI error handling, temporary body-file cleanup, and bounded PR state whenever
this layer changes.

## Local commit execution

`/flow-commit` creates local commits from structured payloads and staged changes
only. It renders the final message from the configured template and passes that
message through a temporary file to `git commit --file`.

Safety expectations for commits:

- never run `git add .` by default;
- refuse commits when no staged changes exist;
- warn but do not include unstaged or untracked files;
- refuse normal commits on reserved branches;
- allow reserved-branch commits only when explicit emergency override policy
  permits them;
- use latest `/flow-check` state when available;
- block failed check state by default unless unverified commits are explicitly
  allowed;
- remove temporary message files after commit attempts;
- never push, open PRs, watch GitHub checks, resolve review comments, or merge.

Reviewers should focus on staged-change safety, reserved-branch handling,
check-state policy, template rendering, and temporary-file cleanup whenever this
layer changes.

## Local check execution

`/flow-check` executes shell-like command strings from validated project-owned
Codeflow config. It does not accept arbitrary command text from command
arguments. Shell usage is isolated in the command execution wrapper because
project configs commonly express checks as strings such as `npm run lint`.

Safety expectations for local checks:

- run only commands from resolved `config.checks`;
- run sequentially, not in parallel;
- support timeouts;
- capture stdout and stderr without hiding stderr;
- summarize large output with bounded display text;
- store only bounded check metadata and summaries in session-state output;
- never commit, push, open PRs, call GitHub automation, or resolve review
  comments.

Configured checks still run with the user's local permissions. Reviewers should
focus on command execution safety, timeout behavior, output handling, and state
storage whenever this layer changes.

## Extension risks

Future extension code may interact with git, GitHub CLI, local checks, and
session state. Any code that shells out, changes repository state, or expands
permissions must be documented, reviewed, and tested.

## Data handling

Codeflow should avoid storing sensitive data in rendered reports, issue comments,
logs, or session state. Check output should be summarized carefully when it might
include secrets.
