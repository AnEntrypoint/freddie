# Turn status tick skips renders until the clock shows

`freddie-turn-status` (`packages/client/ui-conversation/src/client/chat/ChatView.js`) ticks once per second while a turn runs. Before the 15 s clock threshold the rendered output is the constant "Deep diving..." label, so every tick rebuilt an identical vdom and ran `applyDiff` for nothing.

Decision: `#tick` returns early while the elapsed time is under 15 s and the clock was not shown on the last render. `#render` records `#clockShown`; `setProps` and `connectedCallback` render directly, so prop changes and the first paint are unaffected.

Witnessed live on `?fixture` with a running turn mounted, 10 s idle window:
- Interval callbacks at `ChatView.js` (`setInterval 1000`): 10 before and after; the callback still fires, it now returns early.
- DOM mutation records produced inside the tick: 0 before and 0 after. The tick never wrote the DOM with an unchanged value, so this change removes CPU work (one vdom build and diff per second), not DOM writes.
- Total DOM mutations in the window: 80 before and 80 after. Chat view renders 40 seats, no new console errors (only the 3 known fixture RPC errors).
- Clock path: after the 15 s threshold the label reads `Deep diving...` then `20s`, `21s` one second apart.

The render-count reduction itself was not instrumented; it follows from the early return in the code path.

Not changed: `FreddieSlotOutlet` and `slotOutletVNode` (`packages/client/ui-renderer/src/client/scoped-slots.js:580-584`). Each parent render re-applies a fresh `ref` closure to every outlet, which webjsx writes (22 `freddie-slot-outlet ref` writes per 10 s on the fixture, triggered by the fixture's 5 s gamma flip at `packages/client/connection/src/client/fixture.js:2503`). That is a per-render write, not a 1 Hz tick, and the fix belongs to the renderer's ref identity, so it is recorded here for a separate change.
