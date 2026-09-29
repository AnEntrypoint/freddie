# AGENTS.md — Framework Packages

This directory is the harness's own framework layer: the Cordis kernel, its loader/include/group/timer/hmr/logger-console plugins, and the cosmokit and schemastery foundation libraries. See `framework/README.md` for what each package is, what diverged from its upstream ancestor, and why.

**These packages are ours. Edit them directly, like anything under `packages/`.** They descend from upstream projects but are not synced from one: every package was rewritten from TypeScript to plain JavaScript, and the kernel and plugins carry this project's own lifecycle hardening, transactional config reconciliation, durable writes, and watching behavior. There is no sync procedure to follow and no upstream branch to rebase onto. A bug here is a bug to fix here.

Source is plain buildless `src/*.js` — no `tsconfig.json`, no `tsdown.config.ts`, no `lib/` output; `package.json` `main`/`exports` resolve straight to `src/index.js`. Keep it that way.

Two things to do when you change something here:

- If the code's shape would surprise a later reader (a deliberate departure from the obvious implementation, usually because the obvious one was tried and broke), add or extend an entry in `framework/README.md`'s divergence log. That log is the rationale record; it is why the reentrancy and ordering behavior in these packages is legible at all.
- Verify by booting a real composition that exercises the Loader/Include chain end to end, not by reading the source. The lifecycle behavior these packages guarantee is not visible in a static read.

## Rationale

- `webjsx/src/createElement.js` `createElement`/`createElementJSX`: a self-closing tag leaves `props.children` unset; `[]` is set only when children were passed and flattened to nothing. `applyDiff` recurses into a node only when `props.children != null`, and `diffChildren` does `parent.innerHTML = ""` for `[]` against non-empty old children, so a spurious `[]` would clobber subtrees that outlets manage themselves (`FreddieSlotOutlet`/`FreddieRootOutlet`, `packages/client/ui-renderer/src/client/scoped-slots.js`).
- Same file: a function-component tag must be invoked with its props (`type(props)`). Returning only its flattened children drops the component's own props and surfaces its children as bare siblings (the stray-rename-input bug: a closed `Modal` never gated its `<input>` children).
- `include/src/index.js` `Include[EntryGroup.key]`: tree-carrier marker (Group declares it too). The Loader's `internal/config` interpolation (`loader/src/index.js`) keeps such configs literal, because a `!!js` expression in a nested row belongs to that row's own fiber. Include's own fields (`path`, `enableLogs`) therefore stay literal.
- `Include.refresh`: the read runs inside the queued task so the unchanged-content check compares against the predecessor's committed state, not a mid-apply snapshot.
- `applyEntryPatches`: inserted rows are indexed as added so a later patch layer (bundle, then user, then `--patch`) can configure or disable a row an earlier layer inserted. It detaches `data` but pushes `insert` rows by reference from the patch list, so callers applying one patch list more than once must `structuredClone` the patches (`app-boot` `renderConfigDump` does).
