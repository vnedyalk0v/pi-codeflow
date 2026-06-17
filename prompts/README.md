# Prompts

These prompt templates define planned Codeflow lifecycle interactions.

They are intentionally:

- concise;
- model-neutral;
- structured-output oriented;
- aligned with the matching schemas and templates.

Prompts should ask agents for payloads or scoped command usage. They should not
ask agents to render final branch names, commit messages, PR bodies, review
replies, or reports by hand.

Implemented command prompts:

- `flow-start.md`
- `flow-check.md`
