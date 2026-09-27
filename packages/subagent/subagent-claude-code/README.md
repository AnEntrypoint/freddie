# freddie-subagent-claude-code

One-shot subagent provider that runs a delegated task through the **official Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`), spawning a real `claude` CLI process placed under freddie's own managed subprocess owner (credential-scrubbed environment, tree-scoped signalling, the shared SIGTERM→grace→SIGKILL escalation) rather than the SDK's own default process management. Registers on `ctx.subagents` as an out-of-process provider (`NO_START_CAPABILITIES`: an out-of-process child cannot honor parent-enforced `outputSchema`/`depthLimit`/`toolFilter`/`persona`, so the seam rejects a request needing any of them before `start()` runs).

## Surface

```yaml
# cordis.yml
- package: '@freddie/freddie-subagent-claude-code'
  config:
    providerName: claude-code   # default; the name the model's delegation tool selects
    model: claude-opus-4-6      # optional; omit to use Claude Code's own default
    permissionMode: dontAsk     # default; unattended-safe (denies rather than prompting)
```

Every run is unattended by construction: `AskUserQuestion` is disallowed, and `canUseTool`/`onElicitation`/`onUserDialog` deny/decline/cancel rather than block waiting for a human who isn't there (recorded as a safe diagnostic, never surfaced as model-visible text). The child's working directory is always the delegating session's workspace (`resolveChildCwd`, shared with `subagent-acp`'s own contract) — there is no separate cwd override, matching upstream's own choice for this provider.

The real CLI subprocess is spawned through freddie's `ctx.subprocess.spawn()` via a custom-spawn adapter (`ManagedClaudeCodeProcess`) that projects the shared managed-process handle onto the SDK's own `SpawnedProcess` interface, so disposal, environment scrubbing, and termination escalation are governed by the same subprocess seam every other freddie-spawned process uses — not by the SDK's independent process management.

## Model Experience

The delegation tool's result is the SDK's final answer text (`output: [{ type: 'text', text }]`); a non-`completed` `stopReason` carries a bounded (4096 UTF-8 byte), tool-input/credential/environment-free `diagnostic` — never the raw SDK error, protocol payload, or file contents.

#### KV Cache effect

None on the parent's own request; the child Claude Code process makes its own independent request(s) to Claude's API, unrelated to the delegating session's cache.

## Known Limitations and Deferred Work

- **Not listed in `packages/subagent/README.md`'s family table before this change**, unlike `@freddie/freddie-hooks-claude-code`/`-codex` (whose group README already linked their READMEs before either existed). This is a real, verified port of dsh's `@deepseek-ai/dsh-subagent-claude-code` (confirmed against dsh's actual tracked source, not just its docs), not a rediscovered freddie gap — freddie's own table simply hadn't caught up to this specific pairing yet.
- **`subagent-codex`** (the sibling one-shot provider over Codex's app-server protocol, likewise a real, verified port of `@deepseek-ai/dsh-subagent-codex`) now ships alongside this package.
- **No continuable support.** Like the upstream project's own version, this provider has no `prepareContinuable()` — only one-shot delegation, matching the model-facing `tool-subagent`'s foreground-task path, not `tool-subagent-control`'s background/continuable path.
