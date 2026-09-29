# AGENTS.md — protocol

## Rationale

- `src/transport.js`: only JSON syntax errors reach the parse catch, and malformed peer lines are ignored.
- Newline-delimited JSON-RPC 2.0: `id`+`method` request, `id` alone response, `method` alone notification; malformed lines are ignored, missing handlers answer `-32601`, handler failures `-32603`, non-object params collapse to `{}`. Aborting a request removes its pending entry and rejects with the signal reason.
