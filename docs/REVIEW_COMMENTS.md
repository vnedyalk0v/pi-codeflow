# Review Comment Triage

Codeflow should classify unresolved review comments before taking action.
Classification keeps the agent from blindly applying reviewer suggestions that
may be stale, invalid, or require a human decision.

## Classifications

| Classification | Meaning | Default action |
| --- | --- | --- |
| `valid` | The comment identifies a real issue that should be fixed. | Fix, verify, reply, then resolve. |
| `invalid` | The comment is not applicable or is based on a misunderstanding. | Reply with rationale; do not auto-resolve by default. |
| `stale` | The commented code no longer exists or the comment no longer applies. | Reply with evidence and resolve if policy allows. |
| `already_fixed` | The issue has already been addressed by existing changes. | Reply with evidence and resolve if policy allows. |
| `needs_human` | The agent cannot safely decide or act without maintainer input. | Move to `blocked` and ask for a decision. |

## Resolution rule

Comments should not be resolved unless actually addressed or proven `stale` /
`already_fixed`. Invalid comments should receive a clear reply and normally
remain for human review unless maintainers configure otherwise.

## Expected triage payload

Each comment should include:

- id or URL;
- classification;
- rationale;
- proposed action;
- whether it may be resolved after verification.

## Human decision boundary

If a comment asks for product, security, legal, release, or ambiguous design
judgment, classify it as `needs_human` and stop.
