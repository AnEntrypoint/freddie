# Agent Note: Overview as GM mutable-tracking graph

Status: implemented

## Problem

The Overview tab accumulated metric tiles (Attention, Connection, Latest activity, GM counts, Plan, Workflow, Session work, Jobs, Subagents, Terminals, Across the board) while GM itself tracks a dependency DAG of PRD rows and mutables. Operators could not see that graph walking current JIT tool calls and CLI activity; they saw a last-wins checkpoint (`verb`, `phase`, pending counts) and a pile of unrelated status cards. An unused MCP `mcp-gm` row and a designed-but-unmounted `foldGmGraph` left the product claiming a graph it did not ship.

## Decision

The host `gm/progress` ignorable event is the whole-value graph snapshot. [`gmProgressSnapshot`](../../../packages/gm/tool-gm/src/index.js) records lifecycle fields, and [`foldGmGraph`](../../../packages/gm/tool-gm/src/graph.js) accumulates `nodes`, `edges`, and `walking` from instruction `prd_items` / `mutables_pending` (replaced when those lists are not truncated) and from `prd-add` / `prd-resolve` / `mutable-add` / `mutable-resolve` request bodies (upsert even when the daemon echoes only `{added}` / `{resolved}`). Running and settled reports pass the request `body` so walking can attach to a node id. The graph is capped at 80 nodes. `walking` is `{ verb, nodeId }` while a dispatch is running and `null` otherwise. The browser never reads `.gm` files.

[`gm-progress`](../../../packages/gm/gm-progress/src/projection.js) projects that whole value at `stateVersion` 3. Missing `nodes` / `edges` on an older snapshot are treated as empty arrays.

Overview ([`ObservabilityDock`](../../../packages/client/ui-observability/src/client/ObservabilityDock.js)) is graph-first: one CSS-grid column per PRD, mutables stacked by `prdId`, unmatched mutables in an orphans column, plus a local-state inspector (`selectedNodeId`) that edits through inject callbacks over `ctx.remote.gm`. In-flight `gm_prd_*` / `gm_mutable_*` tools attach by parsed `args.id`; other running tools and live terminals overlay the walking node or a Running work lane. Labels are webjsx text children. The dock writes `data-gm-graph` JSON `{ nodes, edges, walking, jit, cli }` with no `argsRaw` and no terminal buffers. Workflows, GM checkpoint, Subagents, and Terminals sibling tabs are removed from this dock; `ui-workflow-run` and `ui-subagent` remain mounted elsewhere.

`Gm` binds Typert Remotes with `bindTypertRemote(this, 'gm')`. `prdAdd` / `prdResolve` / `mutableAdd` / `mutableResolve` / `transition` take an `Agent` and dispatch with `agent.session.header.cwd`. `@freddie/freddie-api-remotes` mounts `@freddie/freddie-gm-client/remote`. The leftover `mcp-gm` composition row is deleted. Typed git-family tools cover the remaining skill-required git verbs.

Host `tool-gm` / `gm-progress` / `gm-client` changes require a Web process restart. Client HMR reloads the Overview renderer against whatever projection the running host already serves.

## Alternatives considered

**Poll `.gm/prd.yml` and `.gm/mutables.yml` from the browser.** Rejected: the gm-progress contract is host-computed whole values; a client filesystem read would skip session replay and cross a trust boundary.

**Mint a sibling `gm/graph` event.** Rejected: `gm/progress` is already ignorable and last-wins; a second event would split the projection key and force dual consumers. Widening the existing payload keeps one fold.

**Embed dagre or mermaid in the product UI.** Rejected: no graph library ships in the client; a deterministic CSS grid over `prdId` edges is enough for the current-session cap.

**Keep the metric-grid Overview and add a Graph tab.** Rejected: the request was to replace the mess, not add another painted surface.

**ApiProxy `gm` namespace or a second Cordis service.** Rejected: `Gm` already extends `Service`; `bindTypertRemote` is the documented path when another base class owns inheritance.

**Keep mcp-gm as an opt-in fallback.** Rejected: leftover MCP flow after native tool-gm coverage; env-gated rows still teach the wrong path.

## Consequences

- Operators see the obligation DAG and the currently walking JIT/CLI work on Overview without opening Chat, and can edit a selected node while GM operates.
- Session logs grow by one graph snapshot per GM dispatch; the 80-node cap and compact titles bound that cost.
- Older `gmProgress` cache rows at `stateVersion` 2 are discarded.
- `gm/progress` stays ignorable, so older readers skip unknown fields rather than refusing the log.
- Model-facing git verbs no longer require the MCP bridge or skill-only dispatch.
