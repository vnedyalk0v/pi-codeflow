# Commits

The AI agent should not freeform-write the final commit message.

Instead:

1. The agent analyzes the staged diff.
2. The agent returns a structured commit payload.
3. Codeflow validates the payload.
4. Codeflow renders the final commit message from `templates/commit-message.md`.
5. Codeflow performs the git commit.

## Required payload shape

```json
{
  "type": "feat",
  "scope": "billing",
  "summary": "add stripe webhook signature verification",
  "context": "Why this change is needed.",
  "changes": [
    "What changed."
  ],
  "verification": [
    "npm run lint",
    "npm run typecheck",
    "npm test"
  ],
  "risk": "Low/medium/high risk and why.",
  "refs": ["BILL-142"]
}
```

## Required fields

| Field | Rule |
| --- | --- |
| `type` | Must be one of the allowed commit types. |
| `summary` | Lowercase imperative phrase, no trailing period, recommended max 72 characters. |
| `context` | Explains why the change is needed. |
| `changes` | Non-empty list of concrete changes. |
| `verification` | Non-empty list of commands or explicit skipped-check reasons. |
| `risk` | Human-readable risk level and rationale. |
| `refs` | List of issue or ticket references; use an empty list when none exist. |

## Optional fields

| Field | Rule |
| --- | --- |
| `scope` | Short lowercase component name without spaces. |
| `riskLevel` | Optional structured value: `low`, `medium`, or `high`. |

## Allowed commit types

- `feat`
- `fix`
- `hotfix`
- `refactor`
- `perf`
- `docs`
- `test`
- `chore`
- `ci`
- `build`
- `revert`

## Field validation rules

- `type` must match the schema enum.
- `scope`, when present, should contain lowercase letters, numbers, hyphens, or
  dots.
- `summary` should be concise and imperative.
- `changes` and `verification` must be arrays, not multiline strings.
- `refs` must be an array even when empty.
- Payloads must not include secrets, tokens, or private credentials.

## Conventional Commits compatibility

Rendered commit titles follow Conventional Commits:

```text
<type>(<scope>): <summary>
```

When `scope` is omitted:

```text
<type>: <summary>
```

## Rendered commit format

```text
feat(billing): add stripe webhook signature verification

Context:
Why this change is needed.

Changes:
- What changed.

Verification:
- npm run lint
- npm run typecheck
- npm test

Risk:
Low/medium/high risk and why.

Refs: BILL-142
```

## Good example

```json
{
  "type": "docs",
  "scope": "workflow",
  "summary": "harden v0.1 lifecycle specification",
  "context": "Implementation work needs a stable lifecycle contract before extension code begins.",
  "changes": [
    "Expanded lifecycle phases and transitions.",
    "Aligned prompts, templates, schemas, and config examples."
  ],
  "verification": [
    "npm run check",
    "JSON validation script"
  ],
  "risk": "Low. Documentation and schema changes only.",
  "refs": ["#1", "#2"]
}
```

## Bad examples

```text
fix stuff
```

Problems:

- no structured payload
- vague summary
- no context
- no verification
- no refs

```json
{
  "message": "feat: add cool thing"
}
```

Problems:

- asks the model to render the final message
- missing required fields
- no risk or verification evidence

## Relationship between branch type and commit type

The primary commit type should usually match the branch prefix. A `docs/` branch
usually contains `docs` commits, and a `fix/` branch usually contains `fix`
commits.

Exceptions are allowed when a PR legitimately contains supporting changes. For
example, a `feat/` branch may include a `test` commit that adds coverage for the
feature.

## Multi-commit PR behavior

- Prefer one focused commit for small changes.
- Use multiple commits when it improves reviewability.
- Each commit still requires a structured payload.
- Avoid mixing unrelated behavior changes in one PR.

## Fix commits after reviewer comments

Reviewer-comment fixes should be small and specific. The commit payload should
reference the review finding when possible, describe what changed, and include
verification that the comment was addressed.
