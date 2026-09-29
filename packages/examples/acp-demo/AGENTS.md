# @freddie/freddie-acp-demo

## Rationale

- `Config` and the persistence passthroughs are deliberately duplicated per entry point (`jscpd:ignore` blocks): each app owns a complete, directly readable schema, and sharing them would make two small app contracts depend on a new facade.
- `toolOrder` uses `.default(undefined)`: absent means lexicographic order (as in the owning system-prompt schema), while schemastery's native `[]` default would read as an invalid configured list.
- Composes agent-spine-demo, JSONL persistence, and the ACP bridge in one ordered lifecycle; unload is reverse so checkpoint/persistence listeners stay attached until ACP agents flush closing events.
- Stdout is reserved for JSON-RPC: no logger, no `hmr`, diagnostics to stderr only; leaves must avoid stdout loggers.
- Pre-creates no agents; the ACP bridge creates one per `session/new`. Adapters, executors, optional tools come from the leaf.
- Named exports only so Loader retains the `Config` schema (docs/postmortem/0001).
- bin: `freddie-acp-demo [--config path]`, default `./cordis.yml`. Replay skips `.env` and selects sibling `cordis.snapshot.yml` so a stray key cannot trigger a model call. EOF disposes and flushes snapshot runs; the caller owns process lifetime.
