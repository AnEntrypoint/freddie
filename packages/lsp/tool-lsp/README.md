# freddie-tool-lsp

Model-facing `lsp` tool over the `ctx.lsp` capability seam (`@freddie/freddie-lsp`): one read-only tool with `goToDefinition`/`findReferences`/`goToImplementation`/`hover` operations. freddie already shipped the full seam — the provider registry (`@freddie/freddie-lsp`) and a generic stdio provider (`@freddie/freddie-lsp-stdio`) — but no package ever registered a model-facing tool on top of it, so the model had no way to call it. This closes that gap, ported from `deepseek-ai/deepseek-harness`'s `tool-lsp`, whose `ctx.lsp` seam this package's `@freddie/freddie-lsp` counterpart matches operation-for-operation.

## Surface

```
lsp({ operation: "goToDefinition" | "findReferences" | "goToImplementation" | "hover", file_path, line, character })
```

`line`/`character` are one-based UTF-16 cursor coordinates (converted internally to the seam's zero-based positions); `findReferences` always includes the declaration. A locations result renders as `path:line:character` grouped by file, capped at `maxLocations` entries and `maxResultChars` total; a hover result renders its contents, capped the same way. The tool requires the calling session's workspace `cwd` — there is no process-cwd fallback, since the LSP provider must canonicalize a real workspace before starting a server — and throws `LspError('LSP_WORKSPACE_REQUIRED')` otherwise.

## Model Experience

Registers a `tool:lsp` system-prompt section (order 107, alongside the other precision-navigation tools) positioning `lsp` as a follow-up to `search`/`read`: use it when a textual match is ambiguous or before a change needs a precise definition, implementation, or reference set, not for ordinary navigation.

#### KV Cache effect

The tool result enters the transcript as plain rendered text (locations or hover contents); nothing here is a request-header or system-prompt-varying value beyond the one fixed `tool:lsp` section text.

## Known Limitations and Deferred Work

- **Not wired into any shipped profile yet.** Neither `@freddie/freddie-lsp` nor `@freddie/freddie-lsp-stdio` appears in `packages/bundle/base` or any `agent-presets/*/agent.cordis.yml` today — the entire LSP capability seam was built but never activated. Adding this tool package to a profile without also registering a working provider would park it forever with `LSP_UNAVAILABLE` (`ctx.lsp.query` finds no route for any file extension). Activating the seam requires deciding which language-server binaries `@freddie/freddie-lsp-stdio` spawns for which extensions (e.g. `typescript-language-server`, `pyright`) and whether they ship as a dependency or are expected on the host `PATH` — a deployment decision this package deliberately does not make unilaterally, since it would add new external binary dependencies ("changing the stack") without a product decision on which servers to standardize on.
- **No structured search-result card.** Unlike `grep`/`glob` (`presentResult` projecting a grouped-by-file `resultView` the client's `searchCardModel` reads), this tool has only a pending-state `presentCall`; the completed call falls back to its plain rendered text. A location/hover result has no natural grouped-matches shape the way a text search does, so this was not built speculatively — this matches the design already recorded in [the LSP capability seam Agent Note](../../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md).
