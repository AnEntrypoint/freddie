# client-ui-layout

## Rationale

- `src/client/AppFrame.js` `#render`: the sidebar, conversation, details and overlay slots sit at fixed tree positions from first paint, with no loading gate (a bare status line reads worse than the shell's own pending rendering). The conversation slot is `session-maybe` and the details slot is strict `session` (`index.js` `apply`), so the details entry renders empty while no session is current.

## CSS rationale

- `AppFrame.css`: custom-element tags default to `display: inline`, which ignores `height: 100%` and truncates every descendant height chain to `auto` (witnessed: the transcript's scroll body never clipped), so `[data-ce='freddie-app-frame']` and `[data-ce='freddie-root-outlet']` are `display: contents`; selectors use `data-ce` because a hot-reloaded class registers under a versioned tag (`--v2`). `freddie-slot-outlet` under `.centerCol` is instead a real flex item (`display: flex; flex: 1; min-height: 0`) because `.centerCol` is a flex container and needs a box to size against, while the two unclassed wrapper `div`s that `scoped-slots.js` injects between `freddie-entry-host` and the outlet are pure pass-throughs (`display: contents`), scoped to `.centerCol` so other entry-host mount points keep legitimate block wrappers.
- `AppFrame.css`: collapse/expand animates the grid tracks on the `--ds-ease-in-out` curve, but dragging writes widths at pointer cadence, so easing is off while dragging (it would detach the column from the handle). The details subtree stays mounted at zero width, so its border must not paint a 1px seam. Drag handles are frame children (columns clip overflow): an 8px hit strip centered on the column border via inline `left`, above column content; the details pill rides the same curve as the tracks and pauses while dragging.
