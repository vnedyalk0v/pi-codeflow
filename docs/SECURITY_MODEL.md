# Security Model

Pi packages can affect agent behavior. Extensions may execute code with the user's local permissions. pi-codeflow must therefore be conservative by default.

## Principles

- No secret access should be required for normal operation.
- No destructive git operations should run by default.
- Reserved branches should be protected from normal AI work.
- Generated outputs should be template-based and auditable.
- Safety boundaries are last-resort airbags, not the main workflow.

## Extension risks

Future extension code may interact with git, GitHub CLI, local checks, and session state. Any code that expands permissions, shells out, or changes repository state must be documented, reviewed, and tested.

## Data handling

Codeflow should avoid storing sensitive data in rendered reports, issue comments, logs, or session state. Check output should be summarized carefully when it might include secrets.
