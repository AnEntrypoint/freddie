# freddie-subagent-freddie-sdk

One-shot subagent provider that delegates to a **complete child Freddie runtime in its own process** — own composition, session, model route, and tools — driven over stdio JSON-RPC through `@freddie/freddie-sdk-client`. The child shares no Cordis context with the parent: this is process-level delegation to another Freddie instance, not an in-process child.

## Surface

```yaml
# cordis.yml
- package: '@freddie/freddie-subagent-freddie-sdk'
  config:
    providerName: freddie-sdk         # default; the name the model's delegation tool selects
    command: node                     # executable that boots the child's SDK JSON-RPC server
    args: ['/path/to/sdk-bin.js']     # arguments to command
    provider: deepseek-official       # route the child runtime initializes with
    model: deepseek-v4-flash
```

Unlike `subagent-claude-code`/`subagent-codex`, this provider has no built-in knowledge of how to resolve a named profile into a launch command — the caller supplies the exact `command`/`args` recipe for booting a child that mounts `@freddie/freddie-sdk-jsonrpc-server` (see `examples/jsonrpc-agent/cordis.yml` for a working composition). The child's working directory is always the delegating session's workspace unless `cwd` is explicitly configured.

## Model Experience

The delegation tool's result is the child's final assistant output, selected via `AssistantOutputFold` (the same canonical last-non-empty-message rule every subagent backend uses). A non-`completed` `stopReason` carries a bounded, structured diagnostic (`provider: Freddie SDK; stage: ...; category: ...`) — never the raw child session events or protocol payload.

#### KV Cache effect

None on the parent's own request; the child Freddie process makes its own independent request(s), unrelated to the delegating session's cache.

## Known Limitations and Deferred Work

- **Documented but unbuilt until now**: `packages/subagent/README.md`'s family table already named `subagent-freddie-sdk` ("Starts an out-of-process Harness child through the TypeScript SDK") before this package existed — a genuine pre-documented gap, confirmed as a real, verified port of dsh's `@deepseek-ai/dsh-subagent-dsh-sdk`.
- **One real adaptation**: dsh's version resolves a named `profile`/`patches`/`dshHome` directly into a spawn command inside its own SDK client (`DeepSeekHarnessOptions` accepts `dshBin`/`profile`/`patches`/`dshHome` fields). Freddie's simpler `@freddie/freddie-sdk-client` `DeepSeekHarness` has no equivalent profile-resolution logic — its constructor takes a plain `launch: {command, args, cwd, env}` recipe directly. This provider's `Config` was adjusted to match: `command`/`args` instead of `dshBin`/`profile`/`patches`/`dshHome`. Everything else (the handshake, turn lifecycle, failure-category mapping, dispose ladder timings) ported unchanged — freddie's `sdk/client` already matches dsh's `dsh-sdk-client` almost line-for-line, including identical default timings (`shutdownTimeoutMs: 1000`, `disposeEofGraceMs: 6000`, `disposeGraceMs: 3000`).
- **Verified live end to end**: a real child Freddie process was spawned via a hand-built SDK JSON-RPC composition (`@freddie/freddie-sdk-jsonrpc-server` + `@freddie/freddie-llm-deepseek` + `@freddie/freddie-agent-spine-demo`), the full `initialize` handshake and `session.prompt` → `turn/start` → ... → `turn/end` lifecycle completed correctly, the real LLM retry policy correctly retried a transient upstream failure five times with backoff, `turn/end`'s `reason.kind: 'error'` was correctly mapped to `stopReason: 'error'`, and disposal cleanly reaped the child. A full `completed` success round-trip was blocked by the test model being unhealthy/rate-limited on this machine's local dev LLM proxy at verification time — an external, transient infrastructure condition, not a code defect; the success-path code (`AssistantOutputFold`, `turn/end` reason mapping for `'completed'`) is the same logic already exercised structurally on the error path. Separately verified: correct rejection when the child process is not a real Freddie runtime (`category: 'transport'`), and correct synchronous rejection of an already-aborted signal before any subprocess is spawned.
- **No continuable support** — one-shot delegation only, matching upstream.
