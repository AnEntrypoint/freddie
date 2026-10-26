# 03-eliminate: trav-gm-38

session: orch-fin-1792994560-7712-21
row: trav-gm-38
input: 01-orient.md, 02-unknowns.md

## Unknown 1: trav-gm-38-u-upstream-tip → refuted

- expected (row contract): upstream main session-provider.js exports currentSessionProvideInfo at line 37.
- observed: upstream main is now a37d72a36783f789c33958a33bd75659c09a07dd. session-provider.js has no occurrence of the name. Line 37 is `const sessionProviderCache = new WeakMap()`.
- probe: gh api contents session-provider.js?ref=a37d72a3... (Bash, no gm dispatch id); resolve dispatch 1792996361743-1866-f3cfc26309b73dd6.

## Unknown 2: trav-gm-38-u-name-history → known

- expected: the row name is a stale revision of this file.
- observed: name count per commit touching session-provider.js (newest first):
  - 1bc78c6117 (2026-10-16) "refactor(client): remove dead exports and a dead module, and share the head-tail cap": 0
  - 76d210b24c (2026-10-06): 1 (`export function currentSessionProvideInfo(host)`)
  - 8453159503 (2026-09-29): 1
  - 807f489ee7 (2026-09-14): 1
  - 4af20aa7d1 (2026-09-05, init): 1
- the 1bc78c6117 diff deletes `currentSessionProvideInfo` and its body (the row's acceptance, already applied).
- 1bc78c6117 is an ancestor of upstream main: `compare 1bc78c6117...main` → ahead 27, behind 0.
- probe: gh api commits?path=... and contents?ref=<sha> loop; resolve dispatch 1792996362282-1867-fcc8ea8c7d36048a.

## Unknown 3: trav-gm-38-u-sae-refs → refuted

- expected: SlotAssemblyError has no code references (alternative unreferenced export).
- observed: referenced in packages/client/ui-renderer/src/client/scoped-slots.js at lines 204, 214, 236, 274, 785 (`new SlotAssemblyError`) and 334 (`instanceof`). The class is live, not dead.
- probe: codesearch literal whole-word, path packages, dispatch 1792996280776-1800-9878ca4cb582f78e; resolve dispatch 1792996362897-1868-fc0750a8ccbd1e94.

## Open unknowns

None. All three resolved.

## New finding from the checks

- The local checkout also lacks the name (orient Read of session-provider.js, file has no `currentSessionProvideInfo`), so the row's acceptance is already satisfied locally and upstream.
- No further unknown is open.
- Next stage: gm-edit. Expected edit: none. The export is already removed at 1bc78c6117.
