# freddie queue: what the held ranks wait on

Written 2026-11-25 from freddie's ranked list (docs/PENDING_VALIDATION.md, rank 9 closed at 959d013b). Nothing below is started. Ranks 4 to 6 wait on fx; ranks 10 and 11 wait on the owner. Standing rules: /workspace/hyperagent/docs/peer-rules.md.

## Rank 4: runtime rewrite on fx:host, and the adapter against the real module (waits on fx)

What fx must deliver:
1. The table-driven fx:host module with its four parts: networking, files, watch, spawn, pty, DNS, crypto and SQLite as host functions over fx's native code (specs/fx-freddie-txiki.md, Stage 2). fx's tree has a fx:host specifier (fx src/core/runcode/host_module.zig) with rows; fx must confirm which rows are complete.
2. The gaps freddie needs closed, both reachable from a JavaScript file: an Anthropic-compatible custom endpoint, and the HTTP and WebSocket server (Stage 2).
3. fx js <file>: run an ES module from disk, with the per-call deadline, the console sink, refused node: specifiers and verbs returned as JSON (Stage 1). I did not find an fx js command in fx's CLI sources (src/core/cli); fx to confirm.
4. The loader and reload that the module graph needs: root resolution, the import map, import.meta.hot, last known good (Stage 3). queue/fx.md records no Stage 1 or Stage 3 work for this plan.

Where it lives: specs/fx-freddie-txiki.md Stages 1 to 3; fx docs/host-interface.md (410 lines, committed) and docs/host-interface-listing.md (generated).

What freddie checks once it is delivered: the eleven adapter cases in packages/host/host-adapter (test/adapter.js) and the parity cases run on fx:host.

## Rank 5: milestones 1 and 2, headless and web inside fx with node removed from PATH (waits on fx, and on the owner's go for the browser route)

What fx must deliver:
1. Stage 1 (fx js) and Stage 2 (the fx:host module) and Stage 3 (loader and hot reload), since freddie's boot needs all three (specs/fx-freddie-txiki.md, Stage 4 depends on them).
2. fx freddie <profile>: the command that boots a freddie profile inside fx (Stage 6, fx part). Milestone 1 is the headless profile; milestone 2 is fx freddie web.
3. Static serving of the web UI and the HTTP and WebSocket server from fx (Stage 2), so a browser session can complete a task.
4. A run with node absent from PATH: fx's engine must run the profile without a node binary (Stage 1).

Freddie's part, after fx delivers: milestones 1 and 2 as recorded runs (specs/fx-freddie-txiki.md, Stage 4).

Browser route: the edgejs browser spike was a no-go (thebird, 2026-11-23); the browser route stays on txiki until the owner's go, and thebird owns its fx:host port (Stage 6, thebird part).

## Rank 6: Stage 5 cuts, with the generic adapter replacing per-capability packages (waits on fx's run_code surface)

What fx must deliver:
1. The published verb table for each surface: names and schemas of every verb, the tools.* services as verbs (run_code.zig buildCatalog; verbs() with schemas). Stage 1 of run_code is closed in fx's tree (queue/fx.md), but the table must be published for freddie to write the adapter's tool rows (fx-run-code-only.md, Stage 1; fx docs/host-interface-listing.md lists 49 registry entries).
2. Per-verb permission in auto mode, with PreToolUse and PostToolUse once per inner verb (fx-run-code-only.md, Stage 2 item 1). The witness is written; fx's queue has it pending. The cut of freddie's permissions and sandbox packages depends on it.
3. Inner calls journaled under their run_code call, so an interrupted run resumes without repeating side effects (fx-run-code-only.md, Stage 2 item 3; design only). The cut of freddie's sessions package depends on it.
4. A body past its deadline continues as a background task, read later by TaskOutput (fx-run-code-only.md, Stage 2 item 4; design only). The subagent cut depends on it.
5. Compaction of run_code calls that lists the inner verbs and their outcomes (fx-run-code-only.md, Stage 2 item 2): witnessed at 528d8d96; nothing to deliver.

Freddie's part, after fx delivers: the Stage 5 cuts in the order the spec gives, each with a parity witness and each deleting the packages it replaces (specs/fx-freddie-txiki.md, Stage 5).

## Rank 10: one plugin manifest, and merging single-implementation seams (owner decision)

Decision for the owner: whether the single-implementation seams (the storage and sandbox layers) merge into their one implementation now, which fixes the package layering the plugin manifest is generated over.

The manifest shape itself waits on fx's loader (specs/fx-freddie-txiki.md, Stage 3).

## Rank 11: tooling node: imports, 96 in 29 files (owner decision)

Decision for the owner: whether the tooling keeps its exemption for node: imports, or depends on the runtime seam instead.

## Update 2026-11-25 after fx's answers (queue/fx.md, items 1 to 11)

- Rank 4: held. fx:host provides 13 of 25 rows; SQLite, pty, watch and the server side of networking are not provided (item 1); the HTTP and WebSocket server and the Anthropic endpoint are not built (item 2); the loader is not built (item 4). The adapter itself now runs against the live host; the runtime rewrite does not.
- Rank 5: held. fx js is not built (item 3), the loader and reload are not built (item 4), the server is not built (item 2), and `fx freddie <profile>` is not built.
- Rank 6: the adapter rows are written against fx's verb table (item 5, 61c4d3b8). The Stage 5 cuts are held: the sessions cut on item 8 (journal), the subagent cut on item 9 (background task), and the permission and sandbox cut on item 6 (its file-mutation change is uncommitted in fx).
- Rank 10 and rank 11: unchanged, held on the owner.

## Update 2026-11-25, second pass (fx's tree at 0d4e06bb, after the adapter push)

- fx committed item 6 as 0d4e06bb (lanmower): the prepared permission path for inner file writes. Its fx side of the permission and sandbox cut is now in fx's tree.
- Still open in fx's answers (queue/fx.md): item 8 (journal of inner calls), item 9 (background task after a deadline), item 2 (the HTTP and WebSocket server and the Anthropic endpoint), item 3 (fx js), item 4 (loader and reload). fx:host is unchanged: 13 rows provided, 12 gaps; it still reports only version, capabilities, tools, verbs and modules.
- Rank 4, measured: `grep -rhoE "from ['\"](node:)?[a-z_/]+['\"]" packages/util/runtime/src` gives 25 Node modules. Of these, 12 are fx gap rows (async_hooks, buffer, dns/promises, http, https, inspector, module, perf_hooks, stream, vm, worker_threads, zlib). The other 13 are provided rows. The runtime cannot drop its node: imports until fx closes the 12 gap rows, so the rewrite stays held on fx items 1, 2 and 4.
- Rank 6, Stage 5 order (specs/fx-freddie-txiki.md): providers and the agent loop come first, and both need an agent namespace in fx:host (host-interface section 3.3, planned). fx:host has no agent namespace, so the cut cannot start there, even though fx item 6 has landed. The permission and sandbox cut is therefore not next.
- Nothing new is unblocked by fx's answers this round. Ranks 4, 5, the Stage 5 cuts, 10 and 11 stay held. The adapter window (freddie-adapter-window3, 73 of 73 steps ok) and its push (3bda3ce9 on origin) are recorded here: the window result is in runs/analysis/window-record-adapter3.json (host-local), and the rank 4 and rank 6 entry of docs/PENDING_VALIDATION.md lists only the adapter test witnesses.
