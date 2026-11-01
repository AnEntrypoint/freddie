# 01-orient: gui-perf-next-input-startup-20261006
session: mcp-codemode-3535970-1793542718115-1-16

## row
title: Measure real-keyboard composer input-to-paint without a profiler, isolate the measured hot work; independently measure fresh owned browser startup critical module/activation path. Preserve session content, draft, caret and scroll.
source: .gm/prd/gui-perf-next-input-startup-20261006.yml:2 (subject only; no acceptance field)
acceptance (derived): one live real-keyboard run of the composer that records input-to-paint in ms with no profiler attached, and one live fresh-browser startup run that records the critical module/activation path, both on the committed tree, with draft, caret and scroll unchanged across the run. Source: row subject clauses "measure actual real-keyboard composer input-to-paint without profiler first" and "independently measure real fresh owned browser startup critical module/activation path".
files named by row: none.

## codeinsight
- FreddieInputBar (packages/client/ui-conversation/src/client/skeleton/InputBar.js:35-864, class): 0 call edges. Custom element, so callers are keyed by tag, not by name. Not evidence of no callers.
- webCommand (packages/bundle/web-app/src/startup.js:11-26): 1 caller, apply at startup.js:29.
- index state: some calls hit store_busy (.gm/gm.db.lock held by pid 3210559, alive). Outlines and callers are marked current only when the refresh completed; re-check before quoting zero.

## codesearch dual (composer keyboard input paint caret draft scroll)
- bm25: skipped (route_without_index).
- commits channel, composer-related: e7886238 (stop per-token outlet re-renders for composer), 8b49b4c2 (stop composer re-rendering per streamed token), e50b595c (composer dock per-token reads), 4efb09e5 (value-guard observable reads), 6c4c727c (copy-on-write draft updates), c7d6d062 (bind input trigger service once), 3d0f8a12 (revert input lexicon trigger cache).
- verbatim phrase: no occurrence in the tree.

## codesearch filename
- composer: packages/client/ui-conversation/src/client/skeleton/ConversationComposer.js, packages/client/runtime/src/client/sessions/composer.js, packages/client/ui-conversation/src/client/input/{facade,hub,machine,blocks,decorations}.js (input machine behind the composer).
- startup: packages/bundle/{acp-app,headless,sdk-app,web-app}/src/startup.js.

## codesearch regex (input event listeners, packages/client/**)
- composer input path: packages/client/ui-conversation/src/client/skeleton/InputBar.js:182 beforeinput listener (#bindBeforeInput).
- the same regex also hits many non-composer keydown/oninput sites (settings, trajectory, primitives); out of scope for this row.

## located lines (verified against the tree by Read)
- InputBar.js:191-263 #afterRender: reads useInput, useComposer, useNotices, useProjection; focus and reveal-caret work on lock or session change.
- InputBar.js:265-374 #onKeyDown.
- InputBar.js:376-401 #onChange: keyboard.setDraft(next, editRangeOf(...)), keyboard.track(next, caret), then this.#render() synchronously.
- InputBar.js:18-33 editRangeOf.

## literal evidence
- "input-to-paint": 3 hits, all row text or .wfgy/lessons.md:27 (lesson: dispatchEvent skips the real input-to-paint pipeline). No measurement code in the tree.

## facts the row relies on
F1 keystroke path is beforeinput -> native input -> #onChange -> keyboard.setDraft -> #render (InputBar.js:376-401). Verified by Read.
F2 the row's prior wave (binding reuse, b564) is in commits channel and notes; the row names no file, so the measured hot function is not yet known.
F3 a real-keyboard input-to-paint number needs a browser (real key events). A gpu-free instrument cannot supply it; state this at ELIMINATE.
F4 startup: webCommand/apply in web-app startup.js is CLI option parsing, not the browser module graph. The browser critical path is a separate surface; locate it at unknowns.

## status
located surface: InputBar.js #onChange/#afterRender and the input machine. Acceptance derived. Next: gm-unknowns.
