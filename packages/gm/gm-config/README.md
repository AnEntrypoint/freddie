# @freddie/freddie-gm-config

Read-only JavaScript resolver for [gm-config](https://github.com/AnEntrypoint/gm-config)'s four-tier protocol. It reads files the gm daemon has already materialized; it never clones, never fetches, never shells to `agentplug-runner`, and never evaluates `hooks/*.js`.

The Rust implementation in `rs-plugkit` (`config.rs`, `prose.rs`, `fsm.rs`) remains the source of truth for serving instruction prose and executing graph hooks. This package exists so Freddie can *inspect* the same on-disk tiers without a spool round-trip that hangs when the daemon's project ticker stalls.

## Tiers

First usable `gm.config.json` wins:

1. `.gm/gm.config.json` (`project_vendored`)
2. `.gm/config.source.json` plus `.gm/config-source-cache/<hash>/` (`project_repo_spec`)
3. `$HOME/.gm/config.source.json` plus `$HOME/.gm/config-source-cache/<hash>/` (`user_repo_spec`; `HOME` then `USERPROFILE`)
4. `.gm/config-source-cache-default/gm.config.json` (`implicit_default_repo`)
5. compiled builtin `{version, instructions.source, index.enabled, memory.enabled}` (`builtin_default`)

A missing cache file is `Rejected`/`Absent` and falls through. This package does not create the cache.

## API

```js
import { resolve, resolveProse, resolveGraph, resolveHookPath } from '@freddie/freddie-gm-config'

const r = resolve(process.cwd())
// r.tier, r.why, r.rejected, r.version, r.config, r.cacheDir

const prose = resolveProse(process.cwd(), 'entry')
// { tier: 'source_repo' | 'local_override' | 'miss' | 'broken', text?, path?, reason? }

const graph = resolveGraph(process.cwd())
// { tier, graph?, path?, reason? }

const hook = resolveHookPath(process.cwd(), 'example.js')
// { path, exists } — never Function/eval/vm
```

`resolveProse` / `resolveGraph` do not invent compiled-default text. A miss means the daemon would serve its baked-in default; this package reports the miss.

## Trust

- **Safe to resolve here:** `gm.config.json` keys, `prose/*.md`, `gates/*.md`, `residual/*.md`, `fsm/graph.json` as JSON.
- **Daemon-owned:** git clone/fetch (`GitRepoFetcher`), `hooks/*.js` execution (`host_exec_js`). Repointing `.gm/config.source.json` or adding a hook is a one-way door; this package will read those files if present but will not run them.

## Model Experience

### Stored domain records

#### What the model sees

Nothing directly. This package contributes no prompt, tool, or schema. `ctx.gm.resolveConfig()` in `@freddie/freddie-gm-client` is the Consumer that surfaces a resolution.

#### Token effect

Zero live-request tokens from this package itself.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- No git clone, fetch, or `ls-remote`. A cold project with no `.gm/config-source-cache-default` resolves to `builtin_default` until the daemon has materialized the cache.
- `resolveHookPath` returns a filesystem path and never evaluates it. Graph-edge hook execution stays in the daemon.
- Compiled-default prose and the compiled FSM graph live inside gm.wasm; this package does not duplicate them.
- Schema `version` above `SCHEMA_VERSION` is accepted (unknown keys reported) matching the Rust `config_version_ahead_of_build` path; versions below `MIN_READABLE_SCHEMA_VERSION` reject.
