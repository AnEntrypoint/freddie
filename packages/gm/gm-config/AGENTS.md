# @freddie/freddie-gm-config

## Rationale

- `invariant.js` registers a no-op installer: gm-config is a read-only filesystem resolver over already-materialized `gm.config.json` tiers, mounts no service, and owns no session events or durable logged relation to check.
- Read-only mirror of rs-plugkit `config.rs`/`config_path.rs` and `crate::hash::fnv1a64`: never clones, fetches or runs hooks (daemon's job). First usable wins: project `.gm/instructions/...` then `<cacheDir>`; a vendored graph replaces the default wholesale; compiled-default prose lives in gm.wasm so is never invented here. Rejected paths/URLs are refused, never rewritten (`ext::`, `file://`, local paths, leading `-` refused). Underscore-prefixed config keys are reserved, not unknown.
