# freddie-subagent-codex

One-shot subagent provider that runs a delegated task through the **official Codex app-server protocol**, spawning the pinned `@openai/codex` package-local wrapper (`codex app-server --stdio`) placed under freddie's own managed subprocess owner (credential-scrubbed environment, tree-scoped signalling, the shared SIGTERM→grace→SIGKILL escalation) rather than resolving a host `codex` from `PATH`. Registers on `ctx.subagents` as an out-of-process provider (`NO_START_CAPABILITIES`: an out-of-process child cannot honor parent-enforced `outputSchema`/`depthLimit`/`toolFilter`/`persona`, so the seam rejects a request needing any of them before `start()` runs).

## Surface

```yaml
# cordis.yml
- package: '@freddie/freddie-subagent-codex'
  config:
    providerName: codex   # default; the name the model's delegation tool selects
    model: gpt-5.5        # optional; omit to use Codex's own account default
    permissionMode: never # default; unattended-safe (declines/cancels rather than prompting)
```

Every run is unattended by construction: command/file approval requests get `cancel`/`decline` (whichever the app-server offers), permission grants are denied, user-input requests get an empty response, and MCP elicitation is declined — each recorded as a safe diagnostic string, never surfaced as model-visible commentary. The child's working directory is always the delegating session's workspace (`resolveChildCwd`, shared with `subagent-claude-code`'s own contract) — there is no separate cwd override, matching upstream's own choice for this provider.

The real app-server subprocess is spawned through freddie's `ctx.subprocess.spawn()` directly (no adapter layer is needed here — unlike the Claude Agent SDK integration, Codex's app-server speaks a plain newline-delimited JSON-RPC protocol over its own stdio, which `@freddie/freddie-sdk-protocol`'s `JsonRpcLineTransport` already speaks natively). `wire.js`'s `CodexAppServerWire` owns only the product methods (`initialize`, `thread/start`, `turn/start`, `turn/interrupt`), current thread/turn association, and terminal-answer selection (the latest `agentMessage` with `phase: "final_answer"`, falling back to `phase: null` when the product emits no explicit final phase).

## Model Experience

The delegation tool's result is Codex's final answer text (`output: [{ type: 'text', text }]`); a non-`completed` `stopReason` carries a safe diagnostic (`product: Codex; stage: ...; category: ...`, plus the latest unattended-decision fact when one was observed) — never the raw JSON-RPC payload, tool-input, or file contents.

#### KV Cache effect

None on the parent's own request; the child Codex process makes its own independent request(s) to its own model provider, unrelated to the delegating session's cache.

## Known Limitations and Deferred Work

- **Real, verified port of dsh's `@deepseek-ai/dsh-subagent-codex`**, checked against dsh's actual tracked TypeScript source (`src/index.ts`/`run.ts`/`wire.ts`), not just its Agent Notes — the protocol methods, failure-category mapping, and unattended-decision handling are a faithful line-for-line adaptation.
- **Two adaptations**, both because freddie's real shape differs from what the TypeScript source assumed: `SessionId(randomUUID())` replaces upstream's `brandString<SessionId>()` (freddie's own plain identity-cast convention); the shared JSON-RPC transport comes from freddie's own already-shipped `@freddie/freddie-sdk-protocol` rather than a Codex-specific package, since its `JsonRpcLineTransport` API matched upstream's usage exactly (constructor, `start`/`close`, `onRequest`/`onNotification`, `request`/`notify`/`flush`) with no changes needed.
- **No continuable support.** Like the upstream project's own version, this provider has no `prepareContinuable()` — only one-shot delegation.
- **Success path not live-verified on this machine.** The installed Codex account only has quota for one model (`gpt-5.5`) and that model's free-tier usage limit was already exhausted at verification time (resets per the CLI's own message). Verified live instead: the full JSON-RPC handshake and thread/turn lifecycle against the real pinned app-server, a real product-side turn failure (an unsupported-model 400 from Codex's own API) correctly mapped to `category: 'product-error'`, correct `stopReason: 'aborted'` settlement after a genuine full startup with a valid model, and correct synchronous rejection of an empty prompt before any subprocess is spawned. The success-path code (`collectOutput`/`agentMessage` parsing) is the same message-routing logic already exercised structurally during the abort test's startup.
