---
description: Produce a structured review-fix payload for Codeflow
argument-hint: "<triaged review threads, fixes, commits, and verification>"
---
Provide only structured review-fix evidence for `/flow-fix-comments`. Do not post
GitHub replies, resolve threads, approve, merge, rerun workflows, delete
branches, or claim a thread is fixed without verification.

Use review thread `threadId` values from the latest `/flow-comments` state. The
payload must be JSON matching `schemas/review-comment-fix.schema.json`:

```json
{
  "prNumber": 123,
  "items": [
    {
      "threadId": "PRRT_kw...",
      "classification": "valid",
      "fixSummary": "Updated validation to reject the unsafe state and added coverage.",
      "verification": ["npm test passed"],
      "checksRun": ["npm test"],
      "commitSha": "abc1234",
      "resolveRequested": true
    }
  ]
}
```

Rules:

- `valid` findings need a real fix, verification, and a commit SHA before
  resolution can be requested.
- `already_fixed` and `stale` need evidence plus verification.
- `invalid` may include a concise rationale, but do not request resolution unless
  project policy explicitly allows it.
- `needs_human` must never request resolution.
- Do not include huge logs or secrets.
- Codeflow renders replies from `templates/review-reply.md` and performs GitHub
  mutations only after payload validation and policy gates pass.
