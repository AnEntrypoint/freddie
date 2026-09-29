# @freddie/freddie-tool-gm

## Rationale

- `invariant.js` registers a no-op installer: each successful model-tool dispatch appends exactly one log-only `gm/progress` snapshot after the daemon response commits, and the session append boundary is authoritative and contains malformed durable payloads.
- `gm_exec_js` dispatches through `gm.call`'s `rawBody` option because `exec_js` is a plain-text-body verb (gm-mcp's `PLAIN_TEXT_BODY_VERBS`), not the JSON-body shape `jsonTool` builds.
