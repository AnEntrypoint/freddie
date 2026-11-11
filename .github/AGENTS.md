# AGENTS.md — GitHub Actions

`publint.yml` is the only workflow: it runs `pnpm install --frozen-lockfile` and `pnpm run publint` on `windows-latest` under native `pwsh`, on pushes to `main`, pull requests and manual dispatch.

## Rationale

- `dependabot.yml` npm `exclude-paths: framework/**`: first-party framework sources are maintained in-tree, not tracked against a registry release ([framework/README.md](../framework/README.md)).
