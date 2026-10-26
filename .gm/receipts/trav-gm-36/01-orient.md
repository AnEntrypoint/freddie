# 01-orient: trav-gm-36

session: orch-fin-1792994560-7712-23
row: trav-gm-36
file: packages/client/ui-settings-models/src/client/store.js

## acceptance

Row text (not derived): "Delete the export and any helper only it uses." Witness plan: "codesearch for onboardingReadiness returns only its definition."

## row premise

Row claims `onboardingReadiness` is exported at `store.js:119` and that no file in `packages` calls it.

## tree state (live)

- Local `store.js` is 117 lines. Line 119 does not exist. The last export is `providerUsable` (`store.js:113-117`). `git_status` scoped to `store.js` and `ModelsSection.js`: clean, `dirty: false`.
- `codesearch` literal, whole word, exhaustive over 4857 files: 2 hits, both in `.agents/notes/implemented/bug-fix/2026-08-12-onboarding-reads-every-provider.md` (lines 17, 36). Zero source hits. Dispatch `1792996658127-2088-217d72b60888ca6f`.
- `callers onboardingReadiness`: index `complete: true`, 0 edges. Dispatch `1792996507950-1976-f04523a6178f0d00`. `impact` (callees, depth 3): 0 reached. Dispatch `1792996512875-1984-1ff42a079622a5f3`.
- Upstream `main:store.js` read via `gh api contents?ref=main`: 117 lines, 0 occurrences of `onboardingReadiness`.

## history

- `1bc78c61170a` (upstream `main`, 2026-10-16T21:58:19Z, "refactor(client): remove dead exports and a dead module, and share the head-tail cap") deletes `export function onboardingReadiness(state)` and its whole body from `store.js`. Verified from the commit patch: the only `store.js` hunk is `@@ -115,46 +115,3 @@` with the function removed.
- Upstream commits after `1bc78c61` (33 commits, 113 files, compare `1bc78c61170a...main`): 0 added lines contain `onboardingReadiness`. `store.js` and `ModelsSection.js` are not changed upstream since `1bc78c61`.
- The export was deleted before this run. The row's premise is stale.

## helper check

- The removed body called `providerUsable` (`state.rows.some(providerUsable)`). `providerUsable` still has a live consumer: `packages/client/ui-settings-models/src/client/ModelsSection.js:3` (import) and `:183` (`state.rows.some(providerUsable)`). It is not a helper only the export used, so it stays.
- Literal scan for `providerUsable`: no test file imports it. Only `store.js`, `ModelsSection.js` and the notes reference it.

## codeinsight

- `callers providerUsable`: index `complete: true`, 0 edges. Edges are keyed by simple name, so this is not evidence of no callers; the literal scan above (`ModelsSection.js`) is the confirmation. Dispatch `1792996740716-2142-3a26f33f049255e5`.

## derived facts

1. The export the row names is absent from local `main` and from upstream `main` (since `1bc78c61`).
2. Acceptance clause 1 (delete the export) is already met. Clause 2 (delete any helper only it uses) has no target: `providerUsable` has a live consumer.
3. The witness plan's literal form ("returns only its definition") cannot pass, because no definition exists. The witness that binds the honest closure is the stale-premise witness.
4. No edit is required. A deletion here would be a no-op.
5. The witness plan's browser step (provider onboarding on a fresh profile) checks behaviour across an edit. This row makes no edit, and the removed body had 0 callers, so no runtime path reached it. No browser lane is opened.

## unknowns for the next stage

- U1: is `onboardingReadiness` absent from the tree and from upstream `main`? Answered by the runs above: yes for the local tree and for `store.js` on upstream; no upstream commit since `1bc78c61` adds it.
- U2: does `providerUsable` have a live consumer outside `store.js`? Answered: yes, `ModelsSection.js`.
- U3: does any uncommitted lane touch `store.js` or `ModelsSection.js`? Answered: no, `git_status` scoped, `dirty: false`.
- U4: does a witness from a session other than `orch-fin-1792994560-7712-23` confirm the stale premise? Open. `prd-close` status `stale` needs such a `witness_dispatch_id`.

Next: `gm-unknowns`.
