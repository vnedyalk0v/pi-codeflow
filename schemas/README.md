# Schemas

Draft JSON schemas describe Codeflow configuration and structured payloads.

They are intentionally simple until implementation begins.

Schema changes should stay aligned with:

- documentation;
- prompts;
- templates;
- example configuration files;
- issue acceptance criteria.

`codeflow.schema.json` and `pr-payload.schema.json` both encode the Codeflow git
branch-name subset used by `/flow-pr` for base/head refs. Keep those schema
patterns aligned with `src/git/git-ref.ts` whenever branch validation changes.
