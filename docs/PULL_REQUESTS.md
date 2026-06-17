# Pull Requests

Codeflow should ask the agent for a structured PR payload, then render the final PR title and body from `templates/pull-request.md` and `.github/pull_request_template.md`.

## Title convention

Use a concise title that matches the primary commit intent, for example:

```text
feat(billing): add stripe webhook signature verification
```

## Body sections

- Summary
- Context
- Changes
- Verification
- Self-review
- Risk
- Rollback
- Linked issues

Each PR should explain what changed, why it changed, how it was verified, what risks remain, and how to roll back if needed.
