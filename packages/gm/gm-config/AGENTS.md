# @freddie/freddie-gm-config

## Rationale

- `invariant.js` registers a no-op installer: gm-config is a read-only filesystem resolver over already-materialized `gm.config.json` tiers, mounts no service, and owns no session events or durable logged relation to check.
