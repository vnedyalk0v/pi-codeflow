---
description: Produce a Codeflow final delivery report
argument-hint: "[context]"
---
Return a structured final report payload.

The package renders the final report from a template. Include:

- `summary`
- `finalPhase`, using the current lifecycle phase enum value
- `changedFiles`
- `checks` with names, results, and useful details
- `issues` or `pullRequest` references
- `reviewComments` addressed, if any
- `decisions` made
- `risks` that remain
- `followUp` work, if any
- `emergencyOverride` reason, if applicable

For completed normal work, `finalPhase` should usually be `final_reported`.
Use `blocked` only when the report explains why Codeflow could not safely
complete the workflow.
