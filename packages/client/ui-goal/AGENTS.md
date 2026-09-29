# client-ui-goal

## Rationale

- `FreddieGoalBar#persistentTooltip` (`src/client/GoalBar.js`): `h(Tooltip, ...)` runs the bare one-shot `Tooltip` factory synchronously, creating a fresh `freddie-tooltip` per call. This element re-renders on every goal or session snapshot, so an uncached tooltip is recreated each render and loses its in-flight hover-delay timer. The cache key is a stable per-call-site label (`'save'`, `'edit'`, ...) because a tooltip has no natural object identity here.

## Contracts

- The node half (`src/index.js`) has an empty `apply` only so the plugin appears in the host `cordis.yml` / Loader; the browser half is discovered through `exports["./client"]` and the `freddie.client` package.json declaration. Every ui-* package here follows this.
- Projection-mode surface: the live goal arrives through `useProjection('goal')`, so the plugin owns no store, refresh chain or event listener. The four mutation verbs (edit/pause/resume/clear) read the session's current projected CAS ref (`{id, revision}`) at call time with no staleness fence; the RPC's CAS is the guard. Goal creation stays on the `/goal` host command.
- `GoalBar` renders nothing for loading (`undefined`), no goal (`null`) and `complete` goals; a blocked goal's reason is the strip title.
- `invariant.js` registers a no-op install: no store, no cordis events, no cross-plugin mutable state; disposal is proven by the HMR-safety spec.
