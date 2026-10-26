# 02-unknowns: trav-gm-38

session: orch-fin-1792994560-7712-21
row: trav-gm-38
input: 01-orient.md

## Unknowns recorded (mutable-add, status unknown)

| id | question | witness at add time |
|---|---|---|
| trav-gm-38-u-upstream-tip | Does upstream main (e73d182c1d12, 13 past the local base) still define no currentSessionProvideInfo and keep session-provider.js unchanged from the 49bea30a8fee copy? | stale-tree note, dispatch 1792996197377-1716-8a0dddad5516e14a; add dispatch 1792996225762-1741-8fbe9fc94a266caa |
| trav-gm-38-u-name-history | Did any commit define currentSessionProvideInfo, so the row name is a stale revision of currentSessionMaybeProvideInfo? | whole-tree 0 matches, dispatch 1792996113083-1643-7de10ffa218badfd; add dispatch 1792996226822-1742-b9968ed2aa6fecba |
| trav-gm-38-u-sae-refs | Is SlotAssemblyError referenced in code (new, instanceof, extends), so it is not an unreferenced export? | callers 0 edges, dispatch 1792996084804-1620-d40880fda775994; add dispatch 1792996228044-1743-8c53b34d2de726fb |

## Facts added since orient

- `currentSessionMaybeProvideInfo` is imported (scoped-slots.js:7) and called (scoped-slots.js:557) in addition to session-provider.js:43. Dispatch 1792996197377-1716-8a0dddad5516e14a. It is the live export; the row's symbol is not.
- Upstream main moved to e73d182c1d12 (13 behind) after the orient fetch. The orient gh read was at 49bea30a8fee; the file is re-read in unknown 1 before any edit.

## Empty-list check

Three unknowns remain open. gm-eliminate runs before any edit.
