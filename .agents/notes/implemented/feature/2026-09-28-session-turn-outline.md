# Agent Note: Whole-log turn outline through a `turnOutline` projection unit

Status: implemented

## Problem

freddie had no `turnOutline` projection — `codesearch` for `turn-outline` across the whole tree returned 0 matches, and nothing resembling it existed. A history client therefore only knows the turns inside its paged event window: freddie's chat pages history 50 messages at a time (the session-stats port hit the same wall from the other side — figures that grew on every "Load earlier" click), so a client cannot offer navigation to a turn it has not loaded, and it cannot name the seq to page back through to load one. `deepseek-ai/deepseek-harness`'s `packages/session/session-turn-outline` is exactly this unit: a pure fold of `turn/start` boundaries, first human prompts, and settled assistant responses into `{ turn, seq, prompt, response }` entries served through the projection seam.

## Decision

New package `packages/session/session-turn-outline` (`@freddie/freddie-session-turn-outline`), one function plugin registering one unit on `ctx.sessionProjections`, ported from the upstream source read off `raw.githubusercontent.com` (`src/index.ts`, `src/projection.ts`, `src/types.ts`, `src/client.ts`). The fold is verbatim in behavior: `turn/start` anchors each entry (its seq is the load-through target for a jump, because the loop logs it before the turn's prompt and steps), a non-advancing `turn/start` is skipped so the outline stays strictly increasing by turn, `prompt` fills from the first `user/message` whose `source.kind` is `'user'` and only while the newest entry is still empty (so steering keeps the first preview and injected context or tool results never leak), and `response` buffers the newest text-bearing `assistant/message` in a state draft that `turn/end` commits. Preview budgets (50 prompt / 120 response) and the space-join, collapse, ellipsis-when-clipped normalization are unchanged.

Adaptations, each forced by a real freddie difference rather than by preference:

1. **`SessionSeq` dropped — `seq` is a plain number.** `codesearch` for `SessionSeq` under `packages/` returns 0 matches; freddie seqs are plain numbers everywhere (`session-stats` compares `state.lastTurn === event.data.turn`, `Session.seq` is `log.length`).
2. **The zod `stateSchema` / `viewSchema` are dropped, and with them the `zod` dependency.** `SessionProjectionRegistry.register()` builds an erased definition carrying only `{ key, init, apply, wire.view, stateVersion }` — a schema passed in is never read — and no freddie unit ships one. The strictly-increasing-turn guarantee upstream enforced in the schema is produced by the fold's own order guard instead, so nothing is lost at the fold level.
3. **`src/types.js` and `src/client.js` are buildless empty outlets.** `TurnOutlineEntry`, `TurnOutlineState`, and the two declaration merges are compile-time-only; `session-stats` sets the precedent for the same conversion, JSDoc included.
4. **An explained empty `./invariant` companion ships anyway.** Upstream publishes none, but `packages/AGENTS.md` requires every package to own one; the reason is package-specific (the relations the fold relies on are owned and runtime-checked by agent-loop and the session surface, and re-folding here would duplicate the implementation rather than compare independent observations).
5. **`stateVersion: 2` is kept from upstream** rather than reset to 1: it is the persisted projection-cache invalidation anchor, and matching upstream keeps the number meaningful against upstream's own state history. No earlier freddie version of this key exists, so nothing to invalidate.
6. **The change-feed claim is corrected, not ported.** Upstream says draft-only applies keep the change feed to three pushes per turn. freddie's `drive()` gates on state identity only (`!Object.is(next, cell.state)`), not on view identity, so a draft update does push a value-identical frame — measured 5 pushes for one streaming turn (boundary, prompt, two drafts, committed response). The `turns` array identity is still preserved, so a carrier comparing view references can drop them; the README states the measured behavior, and this is the same characteristic `sessionStats` already has.
7. **No new session event type, so no `{ignorable: true}` was needed.** The fold reads only `turn/start`, `user/message`, `assistant/message`, and `turn/end`, all already in `KNOWN_SESSION_EVENT_TYPES`; the persistence read path's unknown-type refusal (which forced `ignorable: true` on `deliverables/presented`) is never reached.

**Mounted in the base bundle, with no reader yet.** `packages/bundle/base/cordis.patch.yml` carries a `session-turn-outline` row (and `packages/bundle/base/package.json` the dependency), so every profile composes the unit. Unlike `session-stats` (a web-app bundle row with a live consumer), no freddie client reads `turnOutline` today, so the mount puts one unread key on every history tail page and list row until a consumer lands; the README records this as a known limitation.

## Alternatives considered

**Fold the outline client-side from the paged window.** Rejected: the projection RFC's no-client-folding rule exists precisely so values survive paging, compaction, and cold reads — the window is the thing that is missing the turns.

**Derive the outline in `apiproxy` at history-read time.** Rejected: it would make one carrier own a domain fold instead of registering a unit, and every other carrier (push frames, list rows) would still lack the value.

**Anchor each entry on `user/message` instead of `turn/start`.** Rejected with upstream: the prompt's seq is inside the turn, so a window paged back through it can start mid-turn.

**Take the response from the first assistant message (or from `assistant/chunk`).** Rejected: `turn/end` carries no text and chunks are unbounded partials; the newest text-bearing message matches the loaded rail's `findLast` semantic, and committing at `turn/end` keeps an open turn's response empty rather than half-written.

**Also add the missing `stateSchema`/`viewSchema` support to the registry.** Rejected: that is a change to the seam every unit registers against, taken on behalf of one fold that does not need it.

## Consequences

Verified live on freddie's real stack — real `@freddie/cordis` `Context`, real `SessionStore`, real `SessionProjectionRegistry`, real `Session.append`, plugin loaded with `ctx.plugin` — not stubs: the unit folded a 12-event session into `[{turn:1,seq:0,prompt:"first human prompt xxxxx…",response:"newest word word …wo…"},{turn:2,seq:9},{turn:3,seq:11}]`, clipping a 400-char prompt to 50 and a 400-char response to 120 with a trailing ellipsis; skipped the duplicate `turn/start` with a non-advancing turn number; kept `prompt: ''` for an images-only turn and for a `user/message` with `source.kind: 'plugin'`; kept the first preview across a steering message; committed the newest of two assistant drafts at `turn/end`; and clipped a 5 MB single text block to a 50-char preview without concatenating it. `turns` array identity survived a draft-only apply, an empty-content `assistant/message` and an empty-draft `turn/end` returned the identical state, the checkpoint row read `{ver: 2, seq: 11}`, `viewCheckpoint` and `restore` served the same three entries, and disposing the plugin fiber left `snapshot().values` empty — so the registration really is an effect. `pnpm run publint` passes (247/247, "All good!" for the new package).

Consumers read the key the same way they read every unit (`useProjection('turnOutline')`-style, absent key = capability absence). Cost: one more key per tail page and list row where an assembly composes it, and a few value-identical push frames per streaming turn as consequence 6 records. Wiring a real turn-navigation rail to it is additive client work and is deliberately not part of this change.
