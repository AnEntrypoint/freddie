# Freddie Wire Protocol — v1

The single typed event contract between freddie's agent core and every UI surface
(dashboard chat workspace, `freddie wire` stdio server, REPL). Port of the
kimi-cli wire-mode idea: one event stream, many clients. This document is the
machine-readable-adjacent spec; `src/agent/events.js` (`WIRE_VERSION`,
`WIRE_EVENTS`) is the source of truth it mirrors.

## Envelope

Every event is a JSON object:

```json
{ "v": 1, "event": "<name>", "sessionId": "<id>", "ts": "<ISO-8601>", "data": { } }
```

- `v` — protocol version (integer, currently `1`). Additive event additions keep
  `v` unchanged; breaking renames/removals bump it.
- `ts` — emission time, ISO-8601 UTC.
- `data` — event-specific payload (below).

## Transports

| Transport | Endpoint | Direction |
|---|---|---|
| WebSocket | `/api/agent/stream?sessionId=<id>` (plugins/gui/gui-agent) | bidirectional |
| stdio JSON-RPC 2.0 | `freddie wire` (plugins/wire) | bidirectional, one frame per line |
| ACP stdio | `freddie acp` (src/acp/server.js + src/acp/wire-bridge.js) | bidirectional — wire events translated to ACP `session/update` notifications for Zed/JetBrains-class clients |
| replay log | `<FREDDIE_HOME>/wire/<sessionId>.jsonl` | append-only, one envelope per line |

ACP notes: standard methods `session/new`, `session/load`, `session/prompt`,
`session/cancel` sit alongside freddie's legacy ACP methods; `initialize`
returns the standard `{protocolVersion, agentCapabilities, agentInfo}` shape
when the request carries a `protocolVersion`. Translation: `assistant.delta` +
`message.append` (assistant) → `agent_message_chunk`, `steer.append` →
`user_message_chunk`, `tool.start` → `tool_call`, `tool.end` →
`tool_call_update` (`failed` on denied/budgetExceeded), `approval.request` →
server→client `session/request_permission` (decision fed back via
`resolveApproval`, allow-always included). Mid-turn `session/prompt` queues as
a follow-up; steering rides `_meta.freddie.steer: true` on `session/prompt`.

WS notes: on connect the server sends `{ "type": "replay", "sessionId", "events": [envelope, ...] }`
(cap 500), then live `{ "type": "event", ...envelope }` frames. Client sends
`{ "type": "prompt"|"steer"|"queue"|"cancel"|"approve", ... }`. Turn ends send
`{ "type": "prompt.done", "sessionId", "result", "error", "iterations }`; queued
follow-ups auto-run with a preceding `{ "type": "queue.next", "text" }`.

stdio notes: requests `{ "jsonrpc": "2.0", "id", "method", "params" }`; responses
carry `result`/`error`; events arrive as `{ "jsonrpc": "2.0", "method": "event", "params": envelope }`.
Methods: `initialize`, `prompt {text, sessionId?, cwd?, model?, provider?, timeoutMs?}`,
`steer {sessionId, text}`, `queue {sessionId, text}`, `cancel {sessionId}`,
`approve {sessionId, id?, approved, always?, feedback?}`, `replay {sessionId, limit?}`, `status`.
stdout is frames-only; clients MUST skip lines not starting with `{` (boot chatter).

## Events

| event | data | meaning |
|---|---|---|
| `session.created` | `{prompt, model, provider}` | new session (not emitted on resumes) |
| `session.start` | `{prompt, model, provider}` | turn started |
| `message.append` | `{role, content, tool_calls?}` | user/assistant transcript message (assistant fires per LLM call) |
| `assistant.delta` | `{text}` | streamed text chunk (settled `message.append` is authoritative) |
| `tool.start` | `{name, args, toolCallId}` | tool dispatch began |
| `tool.end` | `{name, toolCallId, result?, denied?, budgetExceeded?, via?}` | tool finished / denied / budget-capped (`via: "classifier"\|"classifier-escalation"` marks classifier-tier denials) |
| `status.update` | free-form | reserved status channel |
| `approval.request` | `{id, name, args, cwd}` | gated tool call paused; resolve via `approve` |
| `approval.resolved` | `{id, name, approved, always?, feedback?, timedOut?}` | approval settled (timeout only for bounded surfaces) |
| `steer.append` | `{text}` | mid-turn injected user message (next step boundary) |
| `queue.append` | `{text, depth}` | follow-up queued for after the turn |
| `session.end` | `{result: "ok"|"error"|"empty", error?, iterations}` | turn settled |
| `session.error` | `{error?|reason?, timeoutMs?}` | turn-level failure (incl. timeout) |
| `status.update` | `{reverted?, turnsBack?, keptMessages?}` | checkpoint-revert notice (also reserved) |
| `subagent.spawn` | — | reserved, not yet emitted (no `emitTurnEvent` call site in the tree) |
| `subagent.progress` | — | reserved, not yet emitted (no `emitTurnEvent` call site in the tree) |
| `subagent.end` | — | reserved, not yet emitted (no `emitTurnEvent` call site in the tree) |

## Session operations

- **fork** — `freddie session fork <id> [atEventIndex]` copies the wire transcript
  into a new session id (wire log + sessions.db rebuilt via `transcriptFromWire`).
- **undo** — `freddie session undo <id>` truncates the wire log at the last
  `session.start` and rebuilds the DB transcript.
- **revert (checkpoint)** — `revert {sessionId, turnsBack?}` (wire method) /
  `{type:"revert"}` (WS): rewinds the RUNNING turn's context `turnsBack` LLM
  steps (root `REVERT` machine event; step journal cleared; truncation computed
  from the live wire events). kimi's D-Mail class of recovery.
- **upload** — `POST /api/sessions/:id/files {name, contentBase64|text}` stores
  under `<FREDDIE_HOME>/uploads/<sid>/`; the path rides the prompt frame's
  `attachments` field and the agent reads it with file tools.

## Turn control semantics

- **Approvals**: `agent.approval_mode` = `off` (default) | `mutating` (gates
  `agent.approval_tools`, default bash/write/edit/file_operations/code_execution/
  process_registry/cronjob/terminal) | `classifier` (an LLM adjudicates every
  call not in `approvedTools` — reasoning-blind prompt, ALLOW/DENY verdict;
  deny feeds back `{error: "tool call denied by policy classifier", reason}`,
  unparseable/failed verdicts fail closed to the human path, 3 consecutive or
  20 total denials escalate the rest of the turn to the human; classifier model
  via `agent.approval_classifier_model`, default the acptoapi `cheap` chain) |
  `all`. Unresolved requests auto-reject after
  `agent.approval_timeout_ms` (default 120s) on bounded surfaces; the REPL passes
  Infinity (waits forever). Rejection feeds the model as the tool result
  `{error: "tool call denied by user", feedback}`. `always` persists a repo-root
  grant (`<FREDDIE_HOME>/approval-grants.json`).
- **Steer vs queue**: `steer` injects into the running turn (drained at the next
  `tool_calls→prompting` boundary); `queue` runs as a new turn after completion.
- **Cancel**: `INTERRUPT` at machine root; takes effect at the next boundary.
- **Repeat protection**: identical name+args streak → `<system-reminder>` at
  3/5/8, force-stop at 12 (`tool_call_repeat`).
- **Budgets**: `agent.tool_budgets: {<tool>: <max per session>}`; breach skips
  dispatch with `tool.end {budgetExceeded: true}` + reminder.

## Versioning

`initialize` returns `{protocolVersion, events, methods}`. Clients should treat
unknown event names as forward-compatible noise and render what they know.
