# AGENTS.md — extensions/ui-cordis

## CSS rationale

- `CordisDefineRow.css`: no running sweep, because `cordis_define` only registers a definition in host memory and the call settles in the same turn, so the state dot carries the whole signal. Terminal definitions (unloaded, or lost to a host restart) stay in the flow as a greyed card: the define call is still in the session log, so removing the row would leave a replay hole. The purpose absorbs the remaining width and clips first, since the name and the switch must survive a narrow row. `CordisPanel.css`: the surface is `position: fixed` so the sidebar's overflow clip cannot cut the 420px panel, with left/bottom offsets measured from the trigger before paint.

## Rationale

- `src/client/CordisPanel.js` `#recovering`: Stop and Remove are tracked apart from run gestures and are never disabled by a run in flight, because a run whose browser half never settles would otherwise disable the only controls that can end it.
- `src/client/inventory.js`: rows are re-read, never patched (`cordis/dynamic-package` and `/retract` announcements carry no labels). Reads are single-flight; a reconnect reset discards the in-flight answer and frees the slot, otherwise the old connection's rows would be published.
- `CordisDefineRow` keeps `expanded`/`selectedSource` in module-scope WeakMap state keyed by callId; `CordisPanel` and `CordisRunRow` are webjsx custom elements that dedupe side effects inside `#render`.
