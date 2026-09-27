# freddie-subagent-acp

One-shot subagent provider that delegates to **any agent speaking the Agent Client Protocol** (ACP) — Zed's standardized, vendor-neutral protocol for driving a coding agent from another program. Unlike `subagent-claude-code`/`subagent-codex`/`subagent-freddie-sdk`, this provider is not tied to any specific product: `command`/`args` name whatever ACP-speaking executable the deployment configures, including another Freddie process running the `@freddie/freddie-acp` server composition.

## Surface

```yaml
# cordis.yml
- package: '@freddie/freddie-subagent-acp'
  config:
    providerName: acp        # default; the name the model's delegation tool selects
    command: node
    args: ['/path/to/an-acp-server-bin.js', '--config', 'acp-server-cordis.yml']
    permission: reject       # default; unattended-safe (denies rather than prompting)
```

The child's working directory is always the delegating session's workspace unless `cwd` is explicitly configured. `permission: allow` auto-approves the child's `session/request_permission` prompts by selecting its first `allow_once`/`allow_always` option; `reject` (default) declines every prompt. No prompt is ever surfaced to a human — this provider is for unattended delegation only.

The real ACP subprocess is spawned through freddie's `ctx.subprocess.spawn()` (the same shared seam `subagent-codex` uses), so disposal, environment scrubbing, and termination escalation are governed by the same subprocess seam every other freddie-spawned process uses.

## Model Experience

The delegation tool's result is the child's accumulated `agent_message_chunk` text (ACP exposes no complete assistant messages the way the harness's own session events do, so output is folded incrementally via `AssistantOutputFold.pushText`). A non-`completed` `stopReason` carries a bounded, structured diagnostic (`provider: ACP; stage: ...; category: ...`, plus the latest unattended permission decision when one was observed) — never the raw protocol payload or tool-call detail.

## Known Limitations and Deferred Work

- **Documented but unbuilt until now**: `packages/subagent/README.md`'s family table already named `subagent-acp` ("Starts an out-of-process child over ACP") before this package existed — a genuine pre-documented gap. Real, verified port of dsh's `@deepseek-ai/dsh-subagent-acp`, checked against dsh's actual tracked source and the real `@agentclientprotocol/sdk` npm package (pinned to the exact same version dsh uses, `1.4.0`, already present in this workspace's lockfile via freddie's own `@freddie/freddie-acp` server package's transitive dependency — every API surface used here, `client`/`methods`/`ndJsonStream`/`PROTOCOL_VERSION`, checked field-by-field against the installed package's type declarations before reuse).
- **No adaptation needed** beyond the routine `SessionId(randomUUID())` branding-convention swap (replacing dsh's `brandString<SessionId>()`) — every other piece (the ACP method names, the permission auto-answer logic, the failure-category taxonomy, the dispose ladder) ported unchanged.
- **Verified live end to end, twice, against a real ACP server**: freddie's own `@freddie/freddie-acp-demo` example (`packages/examples/acp-demo`), run as the child. The full `initialize` → `session/new` → `session/prompt` lifecycle executed correctly over the real ndjson-over-stdio transport; a real upstream model failure surfaced as a genuine JSON-RPC error response from the child, which this provider correctly caught and categorized (`stage: prompt; category: transport`); disposal cleanly reaped the child both times. Separately verified: a non-ACP child process correctly produces `category: 'process-exit'` with the exact exit code, and an already-aborted signal is correctly rejected synchronously before any subprocess spawns.
- **No `completed` success round-trip captured** on this pass, for the same reason as `subagent-codex`/`subagent-freddie-sdk`: this machine's local dev LLM proxy had no healthy model available at verification time. The success-path code (`fold.collect()` after an `end_turn` stop reason) is the same output-folding logic already exercised on every intermediate `agent_message_chunk` notification the protocol test did receive before the child returned its error.
- **No continuable support** — one-shot delegation only, matching upstream.
