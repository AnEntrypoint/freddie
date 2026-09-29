# AGENTS.md — jsonrpc-agent example

## Rationale

- stdout is reserved for JSON-RPC frames: do not add a console logger or terminal UI.
- The model arrives per session over JSON-RPC, so `cordis.yml` does not pin it. The replay overlays' provider catalog claims `deepseek-official` so the SDK server's `initialize` finds it owned and never mounts the real-adapter fallback; the SDK suite passes the replay path explicitly, since the `jsonrpc-demo` bin performs no `FREDDIE_SNAPSHOT` config swap.
- Known gap: the replay overlays name `@freddie/freddie-llm-replay`, which this tree does not ship.
- Snapshot runs read raw JSONL back; production keeps zstd frames.
- `minimal`: the model sees one deployment-selected system prompt and only the owner-scoped persistent Bash and string-replace editor; runtime-context injection and compaction are absent. The editor uses the bare local filesystem while persistent Bash still consumes the shared `danger-full-access` sandbox policy.
