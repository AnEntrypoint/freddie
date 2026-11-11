# @freddie/freddie-sdk-protocol

The shared wire protocol for the Freddie SDK runtime: one newline-delimited JSON-RPC 2.0 transport class plus the request, result, and notification payloads both wire ends speak. The package root exports the transport class and its error type; source modules are not exported as deep imports. The server side is the [`freddie-sdk-jsonrpc-server`](../server/README.md) plugin; no client ships in this checkout. A pure library — no plugin, no Config, no registration.

## Transport

`JsonRpcLineTransport` frames JSON-RPC 2.0 over caller-owned byte streams, one compact JSON frame per `\n`-terminated line. Frames with `id` and `method` are requests, `id` alone is a response, `method` alone is a notification; malformed JSON lines are ignored. `start()` attaches stream listeners, `close()` detaches them and rejects pending requests without destroying the streams. Missing request handlers answer `-32601`; handler rejections answer `-32603` with the error message. An error response rejects the pending `request()` with `JsonRpcResponseError`, which preserves the wire `code` and optional `data`. `JsonRpcLineTransport` and `JsonRpcResponseError` are the package root's exports.

## Wire contract

The JSON-RPC methods and payloads served by `HarnessSdkJsonRpcServer` are:

| Direction | Method | Payload |
|---|---|---|
| client→server | `initialize` | required `cwd`, `provider`, `model`; optional `maxTokens` → `{ serverInfo }` |
| client→server | `session/prompt` | `sessionId`, `contentBlocks` → `{ messageId }` (durable enqueue receipt) |
| client→server | `shutdown` | no params → `{}` |
| server→client | `session.event` | `{ sessionId, event }` (every session in the runtime, unfiltered) |
| server→client | `session.status` | `{ sessionId, status }` (whole-agent `running`/`idle` transition) |
| server→client | `subagent.started` | `{ parentSessionId, childSessionId }` |
| server→client | `subagent.finished` | `{ provider, agentId, parentSessionId, childSessionId, status, stopReason, lastAssistantMessage? }` (in-process runs only) |

`initialize.cwd`, `provider` and `model` are required non-empty strings: the server resolves `cwd` for the session header and rejects a missing field with a `-32603` error naming it. `session/prompt` returns a `messageId` that identifies the queued `UserMessage`; it does not identify a later assistant message, turn ending, or prompt result. Clients combine the open-ended `session.event` stream with agent-wide `session.status` according to their own activity ownership. `subagent.finished.lastAssistantMessage` contains the child's last non-empty assistant message or, when no such message exists, its accumulated assistant text; the field is absent when the child produced neither. `initialize.maxTokens` is an optional positive safe integer that caps each conversation-model output for SDK-created agents and their in-process descendants; omission allows the selected adapter's exact-model default to apply, or otherwise preserves provider behavior. The notification payloads depend on `SessionEvent` (`freddie-session`), `ContentBlock` (`freddie-llm`), and `SubagentStopReason` (`freddie-subagent`) — the protocol streams full session-log envelopes, so the session vocabulary is part of the wire contract. `serverInfo.name` stays the wire-stable `freddie-sdk-runtime`.

## Model Experience

None, as this package defines the client-facing wire protocol; the model-visible surfaces belong to the runtime plugins composed behind the serving [`freddie-sdk-jsonrpc-server`](../server/README.md) entry.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No protocol-version negotiation** — the handshake carries only `serverInfo.version` (`0.0.1`, unvalidated by clients); pre-release stance, no compatibility promise.
- **No cancel or session-close methods** — a client abandons a turn by closing the runtime process; see the [`freddie-sdk-jsonrpc-server` README](../server/README.md).
- **Server→client requests are dead capability** — the transport supports them, but the server never sends one.
