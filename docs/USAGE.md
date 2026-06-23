# Usage

## What pi-codeflow does

pi-codeflow guides Pi Coding Agent through a conservative repository workflow.
It injects Codeflow guidance before agent runs and implements these commands:

- `/flow-start`
- `/flow-check`
- `/flow-commit`
- `/flow-pr`
- `/flow-watch`
- `/flow-comments`
- `/flow-fix-comments`

The lifecycle covers semantic branch preparation, configured local checks,
structured commit payloads, structured PR payloads, GitHub PR check watching,
read-only review-thread triage, and policy-gated review-thread replies or
resolution.

## What pi-codeflow does not do

- It does not merge PRs.
- It does not approve PRs.
- It does not delete branches.
- It does not publish packages.
- It does not replace human judgment.
- It does not automatically trust reviewer comments.
- It does not resolve `needs_human` review threads.
- It does not edit code from `/flow-fix-comments`.
- It does not add release automation.

## Quickstart

1. Install the package.

   See [Installation](INSTALLATION.md).

2. Add `.pi/codeflow.json` to the project.

   Start from [Configuration](CONFIGURATION.md#starter-examples).

3. Start a task:

   ```text
   /flow-start --type feat "Add Google OAuth login"
   ```

4. Implement code changes with the agent.

5. Run local checks:

   ```text
   /flow-check
   ```

6. Stage the intended changes with git or your editor's source-control UI.

7. Prepare a commit payload at `.pi/codeflow/commit-payload.json`.

8. Commit through Codeflow:

   ```text
   /flow-commit --payload .pi/codeflow/commit-payload.json
   ```

9. Prepare a PR payload at `.pi/codeflow/pr-payload.json`.

10. Open the PR:

    ```text
    /flow-pr --payload .pi/codeflow/pr-payload.json
    ```

11. Watch required checks:

    ```text
    /flow-watch --required
    ```

12. Triage review threads:

    ```text
    /flow-comments
    ```

13. After fixing valid review comments, run checks again:

    ```text
    /flow-check
    ```

14. Stage the intended review-fix changes.

15. Prepare a fresh commit payload for the review-fix commit.

16. Commit the review fix:

    ```text
    /flow-commit --payload .pi/codeflow/commit-payload.json
    ```

17. Update the PR with the review-fix commit:

    ```text
    /flow-pr --payload .pi/codeflow/pr-payload.json
    ```

18. Watch checks for the updated PR:

    ```text
    /flow-watch --required
    ```

19. Preview and apply safe replies or resolutions:

    ```text
    /flow-fix-comments --dry-run --payload .pi/codeflow/review-comment-fix.json
    /flow-fix-comments --apply --payload .pi/codeflow/review-comment-fix.json
    ```

20. Final human review and merge remain outside Codeflow.

## Recommended AI-agent workflow

- The user gives the task, issue, constraints, and expected base branch.
- The agent starts with `/flow-start` to prepare the semantic branch.
- The agent changes code or docs on that branch only.
- The agent runs `/flow-check` instead of inventing local check commands.
- The agent prepares structured payload files for commits, PRs, and review
  comment fixes.
- Codeflow renders final commit messages, PR bodies, review replies, and branch
  names from templates.
- The agent avoids raw git and GitHub workflow commands when Codeflow tools
  exist for that step.
- The agent stops for human decisions involving product, security, legal,
  credential, merge, release, or ambiguous reviewer authority.

## Command reference

### `/flow-start`

Purpose: start a Codeflow task and prepare a semantic work branch.

Common usage:

```text
/flow-start --type feat "Add Google OAuth login"
/flow-start --ticket BILL-142 --type feat "Add Stripe webhook verification"
/flow-start "Fix checkout timeout"
/flow-start --emergency "Checkout is down in production"
/flow-start --dry-run --type docs "Document config loading"
```

Key options:

- `--type <type>` chooses a configured branch type.
- `--ticket <ticket>` adds a ticket prefix.
- `--emergency` uses the emergency path.
- `--dry-run` previews without creating or switching branches.

Mutates: creates or switches to the semantic work branch unless dry-run is used.

Does not mutate: commits, pushes, PRs, checks, review comments, or merges.

Expected next step: plan the work, then implement on the prepared branch.

### `/flow-check`

Purpose: run configured local checks from the resolved Codeflow config.

Common usage:

```text
/flow-check
/flow-check --dry-run
/flow-check --all
/flow-check --stop-on-failure
/flow-check --continue-on-failure
```

Key options:

- `--dry-run` lists planned checks without running them.
- `--all` or `--continue-on-failure` continues after failures.
- `--stop-on-failure` stops at the first required failure.

Mutates: Codeflow session state for latest local check results. Configured check
commands may also mutate the worktree if the project config uses formatters,
fixers, generators, or other write-capable commands.

Does not mutate by itself: source files, git commits, branches, PRs, GitHub
checks, or review comments.

Expected next step: fix failures and rerun, or prepare commit payloads after
checks are acceptable.

### `/flow-commit`

Purpose: render and create a local git commit from a structured payload.

Common usage:

```text
/flow-commit --payload .pi/codeflow/commit-payload.json
/flow-commit --dry-run --payload .pi/codeflow/commit-payload.json
/flow-commit --allow-unverified --payload .pi/codeflow/commit-payload.json
```

Key options:

- `--payload <path>` reads the structured commit payload.
- `--dry-run` validates and renders without committing.
- `--allow-unverified` permits missing or failed check state with warnings.
- `--allow-reserved-branch` is only honored by emergency policy.

Mutates: local git history by committing already-staged changes.

Does not mutate: staging area, remote branches, PRs, GitHub checks, review
comments, merges, or branch deletion.

Expected next step: prepare a PR payload and use `/flow-pr`.

### `/flow-pr`

Purpose: render and open or update a GitHub pull request from a structured
payload.

Common usage:

```text
/flow-pr --payload .pi/codeflow/pr-payload.json
/flow-pr --dry-run --payload .pi/codeflow/pr-payload.json
/flow-pr --draft --payload .pi/codeflow/pr-payload.json
/flow-pr --ready --payload .pi/codeflow/pr-payload.json
/flow-pr --base dev --payload .pi/codeflow/pr-payload.json
```

Key options:

- `--payload <path>` reads the structured PR payload.
- `--dry-run` validates and renders without pushing or calling GitHub.
- `--draft` or `--ready` controls draft state.
- `--base <branch>` overrides the configured base branch.
- `--head <branch>` overrides the detected head branch.
- `--push` or `--no-push` controls feature-branch push behavior.
- `--allow-unverified` permits missing or failed local check state with
  warnings.

Mutates: may push the current feature branch and create or update a GitHub PR.

Does not mutate: GitHub checks, review comments, approvals, merges, branch
deletion, or release state.

Expected next step: use `/flow-watch` to read CI status.

### `/flow-watch`

Purpose: read GitHub pull request checks and summarize their status.

Common usage:

```text
/flow-watch
/flow-watch --pr 123
/flow-watch --required
/flow-watch --all
/flow-watch --watch
/flow-watch --once
/flow-watch --fail-fast
```

Key options:

- `--pr <number>` selects a PR.
- `--required` watches required checks only.
- `--all` watches all returned checks.
- `--watch` polls until terminal status or timeout.
- `--once` or `--no-watch` samples once.
- `--interval <seconds>` sets polling interval.
- `--timeout <seconds>` sets polling timeout.
- `--fail-fast` stops on the first selected failure.
- `--dry-run` previews target selection and next actions.

Mutates: Codeflow session state for latest GitHub check summary.

Does not mutate: GitHub Actions runs, workflows, PRs, review comments, source
files, commits, approvals, merges, or branches.

Expected next step: fix failed checks, wait for pending checks, or run
`/flow-comments` after verification is available.

### `/flow-comments`

Purpose: list and triage GitHub pull request review threads read-only.

Common usage:

```text
/flow-comments
/flow-comments --pr 123
/flow-comments --all
/flow-comments --unresolved
/flow-comments --author coderabbitai
/flow-comments --path src/example.ts
/flow-comments --include-outdated
/flow-comments --triage-payload .pi/codeflow/review-comment-triage.json
```

Key options:

- `--pr <number>` selects a PR.
- `--all` includes resolved threads.
- `--unresolved` lists unresolved threads only.
- `--include-outdated` includes outdated threads.
- `--author <login>` filters by author.
- `--path <path>` filters by file path.
- `--max-threads <number>` bounds the scan.
- `--triage-payload <path>` validates structured triage.
- `--json` returns structured output when supported by the command result.
- `--dry-run` avoids GitHub reads and state changes.

Mutates: Codeflow session state for latest review-thread scan and triage.

Does not mutate: code, files, commits, pushes, replies, thread resolution, PR
approval, merge state, or branches.

Expected next step: fix valid findings, run `/flow-check`, commit through
`/flow-commit`, and use `/flow-fix-comments`.

### `/flow-fix-comments`

Purpose: apply policy-gated replies and resolutions for triaged review threads
after fixes and verification.

Common usage:

```text
/flow-fix-comments --payload .pi/codeflow/review-comment-fix.json
/flow-fix-comments --dry-run --payload .pi/codeflow/review-comment-fix.json
/flow-fix-comments --apply-replies --payload .pi/codeflow/review-comment-fix.json
/flow-fix-comments --apply-resolutions --payload .pi/codeflow/review-comment-fix.json
/flow-fix-comments --apply --payload .pi/codeflow/review-comment-fix.json
```

Key options:

- `--payload <path>` reads structured review-fix evidence.
- `--dry-run` previews without GitHub mutations.
- `--apply-replies` posts policy-allowed replies.
- `--apply-resolutions` resolves policy-allowed threads.
- `--apply` posts allowed replies and then allowed resolutions.
- `--allow-invalid-resolution` allows invalid resolution only when policy also
  permits it.
- `--detached` skips stored-triage matching for detached evidence.
- `--pr <number>` selects a PR and must match payload `prNumber` when present.

Mutates: GitHub review-thread replies and resolution only when apply flags and
policy gates allow it.

Does not mutate: source files, commits, pushes, PR creation, approvals, merges,
workflow runs, branch deletion, or automatic code fixes.

Expected next step: report remaining blockers or return to human review.

## Payload examples

### Commit payload

```json
{
  "type": "docs",
  "scope": "usage",
  "summary": "document installation and usage",
  "context": "Users need setup and workflow documentation before release readiness.",
  "changes": [
    "Added installation methods.",
    "Added usage and limitation guidance."
  ],
  "verification": [
    "npm run check passed"
  ],
  "risk": "Low. Documentation-only change.",
  "refs": ["#15"]
}
```

### PR payload

```json
{
  "title": {
    "type": "docs",
    "scope": "usage",
    "summary": "add installation and usage guide"
  },
  "body": {
    "summary": "Added user-facing installation and usage docs.",
    "context": "The package needs setup, usage, and limitation docs for v0.8.",
    "changes": ["Added installation, usage, examples, and troubleshooting docs."],
    "verification": ["npm run check passed"],
    "selfReview": ["Confirmed no runtime behavior changed."],
    "risk": "Low. Documentation-only PR.",
    "rollback": "Revert the PR.",
    "reviewerNotes": "Review command accuracy and install caveats.",
    "refs": ["#15"]
  },
  "draft": true,
  "baseBranch": "dev",
  "headBranch": "docs/installation-usage-guide"
}
```

### Review-comment triage payload

```json
{
  "threads": [
    {
      "threadId": "PRRT_kwExample123",
      "classification": "valid",
      "confidence": 0.86,
      "reason": "The reported docs link is still missing.",
      "recommendedAction": "Add the missing link and rerun docs checks.",
      "filesToInspect": ["README.md"],
      "filesToChange": ["README.md"],
      "checksToRun": ["npm run check:docs"],
      "replyBody": "After the docs update and checks, this link should be covered.",
      "canResolveAfterChecks": true,
      "requiresHumanDecision": false
    }
  ]
}
```

### Review-comment fix payload

```json
{
  "prNumber": 123,
  "items": [
    {
      "threadId": "PRRT_kwExample123",
      "classification": "valid",
      "fixSummary": "Added the missing README link.",
      "verification": ["npm run check:docs passed"],
      "checksRun": ["npm run check:docs"],
      "commitSha": "abc1234",
      "replyBody": "Added the missing README link and reran docs checks.",
      "resolveRequested": true
    }
  ]
}
```

## Common workflows

### Feature work

Use `/flow-start --type feat`, implement the feature, run `/flow-check`, commit
with a structured payload, open a draft PR, watch checks, and triage review
threads.

### Bug fix

Use `/flow-start --type fix`, reproduce or document the failure, make the
smallest fix, run configured checks, and keep the PR focused on the bug.

### Docs-only change

Use `/flow-start --type docs`, update only relevant docs, run docs and package
checks, and use `docs` commit and PR title types.

### Hotfix path

Use `/flow-start --emergency` only when the user gives an emergency reason.
Prefer a `hotfix/` branch. Human release and merge authority still applies.

### Review comments loop

Run `/flow-comments`, classify each thread, fix only valid or already verified
scope, rerun `/flow-check`, commit the fix, watch checks, then use
`/flow-fix-comments --dry-run` before applying replies or resolutions.

### No configured checks

`/flow-check` may report `no_checks` when the project has an empty `checks`
array. Treat that as a warning, not verification evidence.

### Failed checks

Fix the failing command output, rerun `/flow-check`, and do not claim the flow is
verified while required checks fail.

### `needs_human` review comment

Report the blocker and ask for a human decision. Do not resolve the thread, do
not invent product or security decisions, and do not proceed as if verification
is complete.

## Limitations

- The package is early and pre-release.
- GitHub operations require GitHub CLI and authentication.
- GitHub review threads rely on GitHub GraphQL through `gh api graphql`.
- Commands depend on project configuration.
- Local checks execute project-configured commands with local user permissions.
- `/flow-fix-comments` does not edit code by itself.
- Human merge authority remains required.
- Branch protection is not replaced by Codeflow.
- CI can fail independently of local checks.
- Some Pi APIs may evolve; these docs describe current tested behavior in this
  repository.
- Self-review automation and final report command automation remain future work.
