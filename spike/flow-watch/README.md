# Spike: `/flow-watch` GitHub CLI status surface

## Environment

- Repository under design: `vnedyalk0v/pi-codeflow`
- Installed GitHub CLI:

```text
gh version 2.95.0 (2026-06-17)
https://github.com/cli/cli/releases/tag/v2.95.0
```

`gh auth status` reported an authenticated account, so the spike used read-only
GitHub CLI calls. No login or mutation command was run.

## Help surface

`gh pr checks --help` for this installed version documents these JSON fields:

```text
bucket, completedAt, description, event, link, name, startedAt, state, workflow
```

The same help text says the `bucket` field categorizes `state` into exactly:

```text
pass, fail, pending, skipping, cancel
```

`gh pr view --help` documents `statusCheckRollup` and `mergeStateStatus` as JSON
fields.

## pi-codeflow repository sample

Recent `vnedyalk0v/pi-codeflow` pull requests had no checks configured. The
shape for `gh pr view 37 --json statusCheckRollup,mergeStateStatus --repo
vnedyalk0v/pi-codeflow` was:

```json
{"mergeStateStatus":"UNKNOWN","statusCheckRollup":[]}
```

The matching `gh pr checks` command returned no JSON and exited `1`:

```text
no checks reported on the 'dev' branch
```

## Public repository sample with checks

To capture non-empty rows for the installed `gh` version, the spike ran the same
read-only commands against public `cli/cli` PRs.

Command:

```sh
gh pr checks 13684 --json name,state,bucket,link,workflow --repo cli/cli
```

Representative rows:

```json
[
  {
    "bucket": "skipping",
    "link": "https://github.com/cli/cli/actions/runs/27790370507/job/82237599848",
    "name": "close-unmet-requirements",
    "state": "SKIPPED",
    "workflow": "PR Triaging"
  },
  {
    "bucket": "pass",
    "link": "https://github.com/cli/cli/actions/runs/27790370507/job/82237580147",
    "name": "ready-for-review / ready-for-review",
    "state": "SUCCESS",
    "workflow": "PR Triaging"
  }
]
```

Observed `bucket` values from the non-empty samples: `pass`, `skipping`.
Observed `state` values from the non-empty samples: `SUCCESS`, `SKIPPED`.
Documented but not observed in the sampled PRs: bucket values `fail`, `pending`,
and `cancel`.

Command:

```sh
gh pr view 13684 --json statusCheckRollup,mergeStateStatus --repo cli/cli
```

Representative shape:

```json
{
  "mergeStateStatus": "BLOCKED",
  "statusCheckRollup": [
    {
      "__typename": "CheckRun",
      "completedAt": "2026-06-18T21:27:17Z",
      "conclusion": "SKIPPED",
      "detailsUrl": "https://github.com/cli/cli/actions/runs/27790370507/job/82237580819",
      "name": "label-external",
      "startedAt": "2026-06-18T21:27:17Z",
      "status": "COMPLETED",
      "workflowName": "PR Triaging"
    },
    {
      "__typename": "CheckRun",
      "completedAt": "2026-06-18T17:39:41Z",
      "conclusion": "SUCCESS",
      "detailsUrl": "https://github.com/cli/cli/actions/runs/27778078155/job/82195389349",
      "name": "label-external / label_issues",
      "startedAt": "2026-06-18T17:39:36Z",
      "status": "COMPLETED",
      "workflowName": "PR Triaging"
    }
  ]
}
```

## Required-check probe

`gh pr checks --help` documents a `--required` filter, but the JSON fields do not
include a per-row `required` boolean. A read-only sample confirmed the filter
returns only required rows while preserving the same row shape:

```sh
gh pr checks 13679 --required --json name,state,bucket,link,workflow --repo cli/cli
```

Representative row:

```json
{
  "bucket": "pass",
  "link": "https://github.com/cli/cli/actions/runs/27759929432/job/82342310002",
  "name": "build (ubuntu-latest)",
  "state": "SUCCESS",
  "workflow": "Unit and Integration Tests"
}
```

For the v1 design, this means `/flow-watch` should not claim a precise optional
vs. required classification from the all-checks JSON response. The ADR records a
conservative v1 rule that treats all returned checks as required.
