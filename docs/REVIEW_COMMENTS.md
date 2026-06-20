# Review Comment Triage

Codeflow review-comment automation must be conservative because GitHub review
threads can represent reviewer authority, security concerns, and merge blockers.
The first #14 implementation slice now provides the read-only `/flow-comments`
foundation. It lists, normalizes, filters, summarizes, validates structured
triage payloads, and stores bounded session state. It does not implement
`/flow-fix-comments`, thread replies, thread resolution, automatic fixes,
GitHub mutations, or merge automation.

## GitHub comment concepts

GitHub exposes several review-adjacent comment types. Codeflow must not treat
all of them as interchangeable.

| Type | Meaning | Codeflow treatment |
| --- | --- | --- |
| PR issue comments / conversation comments | Top-level comments on the pull request conversation timeline. They use issue-comment IDs and are not tied to a review thread. | Out of scope for #14 except as future input. |
| Inline pull request review comments | Individual comments attached to a diff path and line. They may be part of a review thread. | Read as comment records inside a normalized thread. |
| Pull request review threads | Thread-level conversations around one inline location. They have thread IDs and resolved/unresolved state. | Primary target for #14. |
| Outdated review threads | Threads whose original diff position no longer maps cleanly to the current diff. GitHub may still keep them visible. | Classify as `stale` only after verifying the current code. |
| Resolved review threads | Threads GitHub marks resolved through the review-thread API. | Normally excluded from read-only triage unless all threads are requested. |
| Bot comments from CodeRabbit/Codex | Automated reviewer comments that may contain valid findings or false positives. | Verify against code; never treat as automatically true or false. |
| Human reviewer comments | Maintainer or contributor feedback from a person. | Preserve reviewer authority and escalate ambiguous decisions. |

The primary target for #14 is inline pull request review threads. General PR
issue comments may be considered later. Review thread resolution must use GitHub
review thread IDs, not ordinary issue comment IDs.

## GraphQL-first GitHub approach

The implementation should prefer GitHub GraphQL for review threads because
GraphQL represents thread-level state such as `isResolved` and `isOutdated`.
The initial implementation should call `gh api graphql` instead of adding
Octokit or another runtime dependency.

### Implemented read operation

Read-only `/flow-comments` queries pull request review threads and includes:

- thread `id` as `threadId`;
- `isResolved`;
- `isOutdated`;
- `path`;
- `line` and `startLine` when GitHub provides them;
- thread comments;
- comment author and `authorAssociation`;
- comment body;
- `createdAt` and `updatedAt`;
- URL or permalink when available.

### Future reply operation

A future mutating command may reply to an addressed thread with the GraphQL
mutation `addPullRequestReviewThreadReply`. `/flow-comments` does not implement
that mutation.

### Future resolve operation

A future mutating command may resolve a safe thread with the GraphQL mutation
`resolveReviewThread`. `/flow-comments` does not implement that mutation.

## Normalized data model

The GitHub layer should normalize GraphQL responses before prompting a model,
rendering reports, or storing state. The normalized model should keep thread IDs
separate from comment IDs.

### `CodeflowReviewThread`

```ts
interface CodeflowReviewThread {
  threadId: string;
  prNumber: number;
  path: string | null;
  line: number | null;
  startLine: number | null;
  isResolved: boolean;
  isOutdated: boolean;
  author: string | null;
  authorAssociation: string | null;
  firstComment: CodeflowReviewComment | null;
  comments: CodeflowReviewComment[];
  latestComment: CodeflowReviewComment | null;
  createdAt: string | null;
  updatedAt: string | null;
  url: string | null;
  source: "github-graphql";
  canResolve: boolean;
  canReply: boolean;
}
```

### `CodeflowReviewComment`

```ts
interface CodeflowReviewComment {
  id: string;
  databaseId: number | null;
  author: string | null;
  authorAssociation: string | null;
  body: string;
  path: string | null;
  line: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  url: string | null;
  isMinimized: boolean;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
}
```

## Triage classifications

The schema in `schemas/review-comment-triage.schema.json` defines the structured
triage payload. Each triaged thread must include:

- `threadId`;
- `classification`;
- `confidence`;
- `reason`;
- `recommendedAction`;
- `filesToInspect`;
- `filesToChange`;
- `checksToRun`;
- `replyBody`;
- `canResolveAfterChecks`;
- `requiresHumanDecision`.

Any triage item with `requiresHumanDecision: true` must set
`canResolveAfterChecks: false`, regardless of classification.

| Classification | Rule | Default action |
| --- | --- | --- |
| `valid` | The comment identifies a real issue. It requires a code, doc, config, or test fix. | Fix, run checks, commit, verify, then reply. Do not resolve until the fix is committed and checks pass. |
| `invalid` | The comment is incorrect or based on a wrong assumption. | Prepare a concise explanation. Do not auto-resolve unless project policy explicitly allows it. |
| `stale` | The thread is outdated or no longer applies. | May be resolved only if GitHub marks it outdated or the fix is clearly superseded. |
| `already_fixed` | The issue is already addressed in current code. | Reply with evidence and resolve only after verification. |
| `needs_human` | The thread requires a product, security, API, or design decision. | Report clearly and never auto-resolve. |

Bot authors such as CodeRabbit or Codex still use the same classifications.
The author type changes review priority and confidence, not truth value.

## Command split

### `/flow-comments`

`/flow-comments` is implemented as the read-only triage foundation.

Usage examples:

```text
/flow-comments
/flow-comments --pr 123
/flow-comments --all
/flow-comments --unresolved
/flow-comments --author coderabbitai
/flow-comments --author codex
/flow-comments --path src/foo.ts
/flow-comments --include-outdated
/flow-comments --max-threads 100
/flow-comments --json
/flow-comments --triage-payload .pi/codeflow/review-comment-triage.json
/flow-comments --dry-run
```

Implemented behavior:

- list unresolved inline review threads by default;
- optionally include resolved threads with `--all`;
- optionally include outdated threads with `--include-outdated`;
- filter by one or more authors with `--author`;
- filter by one or more paths with `--path`;
- resolve the target PR from `--pr`, latest `/flow-pr` state, or the current
  branch PR through GitHub CLI;
- read review threads through `gh api graphql` with variables and pagination;
- report an incomplete scan as blocked when the configured max thread bound is
  reached before GitHub pagination is exhausted;
- normalize thread IDs separately from comment IDs;
- validate optional structured triage payloads against
  `schemas/review-comment-triage.schema.json`;
- reject duplicate triage thread IDs, IDs that do not match the selected
  filtered threads, and payloads that omit selected threads;
- produce deterministic summaries with bounded comment body previews;
- store bounded latest review-comments state;
- move lifecycle to `review_triage` when unresolved threads are found;
- move to `blocked` when provided triage requires a human decision;
- make no replies;
- resolve no threads;
- make no code changes;
- call no GitHub mutations.

### `/flow-fix-comments`

`/flow-fix-comments` remains future work and should be mutating only after prior
triage state exists.

Planned behavior:

- use stored triage state;
- fix `valid` findings only within the reviewed scope;
- run `/flow-check` after fixes;
- commit through `/flow-commit` after checks pass;
- reply to addressed threads with the configured template;
- resolve only addressed `valid`, `stale`, or `already_fixed` threads when
  policy allows it;
- never resolve `needs_human`;
- never resolve `invalid` automatically unless policy explicitly allows it.

## Safety policy

Review-thread automation must follow these rules:

- Never resolve a review thread just because the agent believes it is wrong.
- Never resolve valid findings before checks pass.
- Never resolve `needs_human` threads.
- Never mass-resolve all bot comments.
- Never treat CodeRabbit, Codex, or other bot comments as automatically true.
- Never treat CodeRabbit, Codex, or other bot comments as automatically false.
- Always verify against the current code.
- Always preserve human reviewer authority.
- Replies must be concise and specific.
- Read-only triage drafts for `valid` findings must not claim a fix is already
  complete.
- Resolution requires explicit classification and passing verification.
- Auto-resolution can be disabled by config and defaults to disabled.

## Lifecycle expectations

After a PR exists and GitHub checks are available, `/flow-comments` can move the
lifecycle to `review_triage` when unresolved threads exist. If no unresolved
threads exist, the flow may stay `verified` when prior verification evidence is
complete; the command does not falsely claim `final_reported`. Dry-run mode does
not update state or transition lifecycle.

When valid comments exist, the next phase is `fixing_review_findings`. After
fixes are applied, the agent returns to `/flow-check`, then `/flow-commit`, then
pushes through the PR flow and uses `/flow-watch` for remote verification.
Replies and resolution are allowed only after verification.

When a thread is `needs_human`, the workflow must move to `blocked` or remain in
`review_triage` with an explicit human decision request. The agent must not make
speculative product, security, API, or design decisions.
