# AGENTS.md — GitHub Actions

Run jobs on Windows runners (`windows-*` labels) under native `pwsh`. The pull-request `windows` job is the deliberate exception: it runs Windows Node under Wine on hosted Linux and blocks `all checks passed`; `windows-native` runs automatically on `windows-2025` (or the self-hosted `[self-hosted, dsh-win-ci, windows]` pool under `FREDDIE_CI_FAILOVER_WINDOWS=selfhosted`) but reports independently. `ci.yml` is pull-request-only; the master `serial-windows` standby, the Linux `serial-linux-selfhosted` standby, the `wine-apt-cache` seeder, and the two manual runner benchmarks live in `ci-master.yml` (master-push + `workflow_dispatch`). Because `ci-master.yml` does not listen to `pull_request`, those master-only jobs never appear in PR check panels (a job a workflow defines for a given event is listed and shows `skipped` when its `if` is false); keeping them in a separate workflow is what stops PR check circles from showing gray segments. The master `serial-windows` standby continuously validates the self-hosted failover target — see the [failover runbook](../.agents/notes/implemented/process/2026-07-26-ci-failover-runbook.md).

## Rationale

- `dependabot.yml` npm `exclude-paths: framework/**`: first-party framework sources are maintained in-tree, not tracked against a registry release ([framework/README.md](../framework/README.md)).
- `.github/issue-management/policy.mjs` reserves the retired label aliases so they cannot be recreated as new labels.
- `transitionResolvingIssues` writes a Project status from a state read moments earlier because GraphQL has no compare-and-swap; a stronger guard needs per-Issue serialization or a conditional ProjectV2 update.
- `countVisibleUnits` counts whitespace-delimited Latin, numeric and code tokens; the 50-unit limit applies to the exposed body outside `<details>`.

- nextResolvingIssueStatus returns null when no permitted transition exists; callers skip the Project write. A changes-requested review moves In review back to In progress only when the configured lifecycle actor set the current status.
