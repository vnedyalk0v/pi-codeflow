# Extensions

This directory contains the pi-codeflow Pi extension entrypoint.

## Implemented

- `codeflow.ts` registers the Codeflow before-agent guidance injection hook.
- The hook loads validated Codeflow config through the config loader.
- The hook injects model-neutral guidance before agent runs.
- Config load failures produce safe warning guidance instead of raw crashes.

## Not implemented yet

- `/flow-start`
- Semantic branch creation
- Check runner
- Commit generation
- PR generation
- GitHub checks watcher
- Review comment automation
- Persistent lifecycle storage

Future extension work should remain issue-driven, docs-first, aligned with the
architecture and security model, and validated against the configuration schema
before workflow-changing behavior is added.
