---
description: Classify GitHub pull request review threads for Codeflow
argument-hint: "<normalized review threads>"
---
Classify each normalized GitHub pull request review thread before taking action.
This is read-only triage. Do not change code, post replies, resolve threads,
commit, push, or merge.

Primary input should be `CodeflowReviewThread` records from GitHub GraphQL.
Use the review thread `threadId`, not an issue comment ID, as the stable
identifier.

Allowed classifications:

- `valid`: the thread identifies a real issue that needs a code, doc, config,
  or test fix. Do not resolve until the fix is committed and checks pass.
- `invalid`: the thread is incorrect or based on a wrong assumption. Prepare a
  concise explanation, but do not auto-resolve unless policy explicitly allows.
- `stale`: the thread is outdated or no longer applies. Resolve only when
  GitHub marks it outdated or current code clearly supersedes it.
- `already_fixed`: current code already addresses the issue. Verify before any
  reply or resolution.
- `needs_human`: product, security, API, design, legal, credential, merge, or
  release judgment is required. Never auto-resolve.

Return JSON that matches `schemas/review-comment-triage.schema.json`:

```json
{
  "threads": [
    {
      "threadId": "PRRT_kw...",
      "classification": "valid",
      "confidence": 0.82,
      "reason": "The reviewed path still has the reported issue.",
      "recommendedAction": "Update the failing validation and add coverage.",
      "filesToInspect": ["src/example.ts"],
      "filesToChange": ["src/example.ts", "tests/example.test.ts"],
      "checksToRun": ["npm test"],
      "replyBody": "Draft after fix and checks: update the validation path and add test coverage.",
      "canResolveAfterChecks": true,
      "requiresHumanDecision": false
    }
  ]
}
```

Replies must be concise and specific drafts only. For `valid` findings during
read-only triage, `replyBody` must be tentative or explicitly after-fix phrasing;
it must not claim a fix is already complete. A later mutating command may render
and post replies from `templates/review-reply.md` after verification and policy
checks.
