# Workflows

## Validate

`validate.yml` runs package validation for:

- pull requests targeting `dev` or `main`;
- pushes to `dev` or `main`;
- manual `workflow_dispatch` runs.

The workflow uses Node 20, installs dependencies with `npm ci`, and runs the
canonical local validation command:

```sh
npm run check
```

That command validates JSON files, text safety, Markdown docs format,
TypeScript, and the test suite.

The workflow is validation-only. It does not publish packages, deploy, require
secrets, or request write permissions.
