# AGENTS.md — ui-slots

## Rationale

- `src/index.js` `SlotCore.register`: kind constraints stay runtime checks for dynamically composed callers (typed callers satisfy `KindOptions` statically). A cell is occupied only at the exact priority; a different priority shadows.
- `src/index.js` `SlotCore.register` store handles: a shared handle pins its scope on first mount (one handle, one scope); factory stores are exempt because the framework creates per-entry instances with no shared identity.
- `src/index.js` `SlotCore.register` ordering: stable sort, priority ascending for every kind, ties keep registration sequence (a cell's winner is its first occurrence; chain tries lower priority first). `list` refines equal priorities by explicit `order` so the raw ledger keeps its display sequence for priority-less compositions.
- `src/index.js` `SlotCore.register` children: every child declaration is written before any listener is notified, because synchronous listeners may register into or try to redeclare a sibling.
- `src/index.js` `SlotCore.flush`: `flushScheduled` is reset before iterating so a mutation from inside a listener re-schedules a flush.
