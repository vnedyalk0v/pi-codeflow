# Review Comment Triage

Codeflow review-comment automation must be conservative because GitHub review
threads can represent reviewer authority, security concerns, and merge blockers.
The #14 implementation now provides the read-only `/flow-comments` foundation
and the safe mutating `/flow-fix-comments` foundation. `/flow-comments` lists,
normalizes, filters, summarizes, validates structured triage payloads, and
stores bounded session state. `/flow-fix-comments` consumes review-fix evidence,
renders deterministic replies, and performs GitHub review-thread reply/resolve
mutations only behind explicit apply flags and policy gates. It does not
implement automatic fixes, merge automation, auto-approval, branch deletion,
workflow reruns, or mass-resolution.

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

### Implemented reply operation

`/flow-fix-comments` may reply to an addressed thread with the GraphQL mutation
`addPullRequestReviewThreadReply` after payload validation, classification
checks, and reply policy pass. `/flow-comments` remains read-only and does not
call this mutation.

### Implemented resolve operation

`/flow-fix-comments` may resolve a safe thread with the GraphQL mutation
`resolveReviewThread` after payload validation, classification checks, required
verification, and resolution policy pass. `/flow-comments` remains read-only and
does not call this mutation.

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
- store bounded latest review-comments state, including latest comment IDs;
- move lifecycle to `review_triage` when unresolved threads are found;
- move to `blocked` when provided triage requires a human decision and keep
  unresolved human-decision threads from reaching `verified`;
- make no replies;
- resolve no threads;
- make no code changes;
- call no GitHub mutations.

### `/flow-fix-comments`

`/flow-fix-comments` is implemented as the safe mutating follow-up to
`/flow-comments`. It does not edit source files or create fixes itself. Instead,
it consumes a structured review-fix payload after the agent has made focused
fixes, run verification, and committed when needed.

Usage examples:

```text
/flow-fix-comments --payload .pi/codeflow/review-comment-fix.json
/flow-fix-comments --dry-run --payload .pi/codeflow/review-comment-fix.json
/flow-fix-comments --apply-replies --payload .pi/codeflow/review-comment-fix.json
/flow-fix-comments --apply-resolutions --payload .pi/codeflow/review-comment-fix.json
/flow-fix-comments --apply --payload .pi/codeflow/review-comment-fix.json
/flow-fix-comments --pr 123 --payload .pi/codeflow/review-comment-fix.json
```

Implemented behavior:

- validates `schemas/review-comment-fix.schema.json` payloads;
- matches payload thread IDs to latest `/flow-comments` state unless `--detached`
  is used, in which case stale stored triage metadata is ignored during
  validation and execution;
- refuses mutation when `reviewComments.enabled` is false;
- refuses mutation when explicit `--pr` and payload `prNumber` disagree;
- refuses mutation when latest `/flow-comments` state is incomplete or failed;
- renders replies from `templates/review-reply.md`;
- still posts policy-allowed replies when resolution is blocked by checks;
- avoids claiming a thread is resolved before the resolution mutation succeeds;
- calls `addPullRequestReviewThreadReply` only in apply-reply mode;
- calls `resolveReviewThread` only in apply-resolution mode;
- honors `reviewComments.autoResolveClassifications` before automatic
  resolution;
- never calls GitHub mutations during dry-run or preview-only mode;
- stores bounded review-fix outcome state without full reply bodies;
- records which latest comment a posted reply addressed;
- skips threads already resolved by latest triage or prior `/flow-fix-comments`
  outcome state so retries stay idempotent, unless fresh triage shows the
  thread was reopened;
- skips duplicate replies only while the latest scanned comment is already
  covered by the prior reply, so fresh follow-up feedback can receive a new
  response;
- treats GitHub `thread_already_resolved` responses as idempotent resolution
  success;
- redacts rendered reply bodies from generic GitHub mutation failures;
- never edits code, commits, pushes, approves, merges, reruns workflows, deletes
  branches, or mass-resolves comments.

Classification-specific action rules:

| Classification | Reply policy | Resolution policy |
| --- | --- | --- |
| `valid` | Allowed only with `fixSummary` and verification evidence. | Allowed only with `commitSha`, verification, and checks-before-resolve evidence. |
| `already_fixed` | Allowed with evidence and verification. | Allowed only when config permits `already_fixed` and checks-before-resolve passes. |
| `stale` | Allowed with evidence and verification. | Allowed only when config permits `stale`, the thread is outdated or evidence explains staleness, and checks-before-resolve passes. |
| `invalid` | Allowed for concise explanation when evidence/rationale exists. | Blocked by default; allowed only by explicit project/user policy. |
| `needs_human` | Blocked by default because Codeflow cannot make the decision. | Never allowed. |

For `stale` resolution, GitHub `isOutdated` state counts as staleness evidence;
`fixSummary` is required only when GitHub does not mark the thread outdated or
when a reply needs text evidence.

When `reviewComments.requireChecksBeforeResolve` is true, resolution requires a
passed latest `/flow-check` state or acceptable explicit payload evidence when no
check state exists, and stored `/flow-watch` GitHub checks must also match. Failed, skipped, timed-out, or unknown check evidence blocks
resolution. `needs_human` and latest triage `requiresHumanDecision` always block
resolution regardless of flags.

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
- `/flow-fix-comments` requires explicit `--apply-replies`,
  `--apply-resolutions`, or `--apply` unless config auto-reply/auto-resolve is
  deliberately enabled.
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
`/flow-fix-comments` can then dry-run planned replies/resolutions or apply only
the allowed mutations requested by flags.

`/flow-fix-comments --dry-run` or preview-only mode does not claim final
verification. Successful allowed replies/resolutions may move toward `verified`
when check evidence passed and no blockers remain. Mutation failures move to
`blocked` or another safe non-final phase with a clear error.

When a thread is `needs_human`, the workflow must move to `blocked` or remain in
`review_triage` with an explicit human decision request. The agent must not make
speculative product, security, API, or design decisions.
