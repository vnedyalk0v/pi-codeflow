# Commits

Codeflow should ask the agent for a structured commit payload, then render the final commit message from `templates/commit-message.md`.

## Payload fields

- `type`
- `scope`
- `summary`
- `context`
- `changes`
- `verification`
- `risk`
- `refs`

## Rendered message example

```text
feat(billing): add stripe webhook signature verification

Context:
Payment webhook handlers need to reject forged Stripe events before processing invoice updates.

Changes:
- Add signature verification before event dispatch.
- Return clear errors for missing or invalid signatures.
- Cover valid and invalid webhook scenarios with tests.

Verification:
- npm run test -- billing-webhooks

Risk:
Low. Verification runs before existing event handling and does not change downstream payload processing.

Refs: BILL-142
```
