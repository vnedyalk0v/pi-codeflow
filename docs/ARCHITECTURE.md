# Architecture

pi-codeflow is intended to be a Pi package composed of extension code, skills, prompts, templates, config, schemas, and documentation. Production implementation is intentionally deferred.

## Policy Engine

Owns workflow rules such as reserved branches, allowed branch types, required payload fields, emergency overrides, and destructive-operation restrictions.

## Guidance Engine

Injects the active Codeflow lifecycle guidance into the agent. It should direct agents to provide structured payloads and use Codeflow tools instead of inventing workflow formats.

## Tooling Layer

Provides future commands and tools such as `/flow-start`, `/flow-check`, `/flow-commit`, `/flow-pr`, `/flow-comments`, and `/flow-report`.

## Template Renderer

Converts structured payloads into branch names, commit messages, PR bodies, review replies, and final reports using documented templates.

## Git/GitHub Integration

Uses local git and GitHub CLI where possible to create branches, inspect status, open PRs, watch checks, and manage review comments.

## State Store

Records lifecycle state, check results, rendered outputs, and review triage in session state. Repository files should not be modified for transient state unless explicitly configured.

## Safety Boundary

Blocks or warns about unsafe operations such as normal work on reserved branches, destructive git commands, and unresolved emergency overrides. Safety boundaries are fallback airbags, not the main workflow.

## Config/Schemas

Defines `.pi/codeflow.json`, default behavior, and payload schemas for validation and documentation.

## Skills and Prompts

Skills teach agents when and how to use Codeflow. Prompts request structured outputs for planning, self-review, commits, PRs, comment triage, and final reporting.
