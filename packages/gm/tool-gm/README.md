# @freddie/freddie-tool-gm

Model-facing typed tools over [`ctx.gm`](../gm-client/README.md): `gm_instruction`, `gm_phase_status`, `gm_codesearch`, `gm_recall`, `gm_prd_add`, `gm_prd_resolve`, `gm_mutable_add`, `gm_mutable_resolve`, `gm_transition`, `gm_exec_js`, `gm_git_finalize`, `gm_scan_deps`, `gm_residual_scan`. Each tool names the real spool-verb fields instead of the generic MCP bridge's opaque `(verb, body)` shape.

Session id is not a per-call argument. Every tool closes over the mounted `ctx.gm` instance, whose `sessionId` is fixed at plugin config. Each execute passes `exec.agent.session.header.cwd` as `options.cwd` so the spool is the session workspace, not the GUI host's `process.cwd()`.

## Durable progress event

The tool writes a log-only, `ignorable` `gm/progress` event at dispatch start and settlement. Its complete payload carries `{ verb, status, phase, prdPendingCount, mutablesPendingCount, sessionId, belongsToConfiguredSession, startedAt, finishedAt, durationMs, error }`; running events retain the preceding semantic checkpoint, including one restored from the session projection after plugin reload, while failed settlement records its bounded error text. Progress-recording failures are contained and never alter the GM tool result. These records never enter model history or change tool schemas/results.

## Tools

| Tool | Verb | Args | Behavior |
|---|---|---|---|
| `gm_instruction` | `instruction` | `prompt?` | Current phase prose and PRD/mutables. First call of a session must include `prompt`; later calls take none. |
| `gm_phase_status` | `phase-status` | none | Phase, transition history, pending PRD/mutable counts without instruction prose. |
| `gm_codesearch` | `codesearch` | `query`, `k?`, `mode?`, `root?` | Ranked file:line hits from gm's incremental index. |
| `gm_recall` | `recall` | `query` | Semantic hits from gm's memory store (keys, not file:line). |
| `gm_prd_add` | `prd-add` | `id`, optional fields | Add or rescope one PRD row. |
| `gm_prd_resolve` | `prd-resolve` | `id`, `witness_evidence`, `commit_comment?` | Mark one PRD row resolved. Empty `witness_evidence` is rejected. |
| `gm_mutable_add` | `mutable-add` | `id`, optional fields | Record one typed proof obligation. |
| `gm_mutable_resolve` | `mutable-resolve` | `id`, `witness_text` | Discharge one previously recorded mutable. `witness_text` is mapped to the daemon's `witness_evidence` field. |
| `gm_transition` | `transition` | `to` | Advance phase when gates pass. |
| `gm_exec_js` | `exec_js` | `code`, `timeoutMs?` | Plain-text-body sandbox execution. |
| `gm_git_finalize` | `git_finalize` | `message`, `files?` | Add, commit, porcelain-gate, push, CI-watch. |
| `gm_scan_deps` | `scan_deps` | `root?`, `full?` | HiddenSpawn-class dependency scan of git-tracked source plus present `node_modules`. |
| `gm_residual_scan` | `residual-scan` | none | DECIDE→COMPLETE stop-window scan. Writes `.gm/residual-check-fired` for this session. |

Each tool declares `timeoutMs` equal to the spool default (120000) except `gm_codesearch` (360000, matching live dual-index duration on this machine) and `gm_scan_deps` (180000). `gm_exec_js` polls for `max(120000, args.timeoutMs)` so a larger snippet budget is not truncated by the host tool timeout. Each tool forwards `exec.signal` into `Gm.call`, so a cancelled turn stops the poll instead of waiting the remaining timeout.

`gm_codesearch` presents a search card from `bm25_hits.symbol.path`/`line_start`, `vector_hits.path`, filename `hits.path`, or commit-vector `commits`. Truncation follows the verb body's `truncated` field. `gm_recall` presents a generic summary of hit keys. `gm_instruction` and `gm_transition` present a compact title (verb, phase, PRD-pending count when those fields exist).

```yaml
- id: tool-gm
  name: '@freddie/freddie-tool-gm'
```

## Model Experience

### Stored domain records

#### What the model sees

Thirteen tool schemas with per-verb JSON fields. Results are the parsed spool JSON as pretty-printed text.

#### Token effect

Fixed schema cost per request while the plugin is mounted. Result tokens follow each verb's response body until compaction.

#### KV Cache effect

Prefix-stable while the thirteen definitions stay mounted. Plugin lifecycle may invalidate reuse from the first changed schema token.

## Known Limitations and Deferred Work

- `gm_exec_js` `timeoutMs` is the sandbox's own prefix, independent of the tool-call budget (`GM_TOOL_TIMEOUT_MS`). A sandbox timeout shorter than the tool budget still returns through the spool; a cancelled turn still aborts the poll.
- Presentation is display-only. Malformed replayed meta falls back to the generic card and never throws.
