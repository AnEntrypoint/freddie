# 02-unknowns: trav-gm-36

session: orch-fin-1792994560-7712-23
row: trav-gm-36

## facts the orient receipt does not prove

- U4 (open, mutable `trav-gm-36-unknown-verifier-witness`, dispatch `1792996818023-2181-c2f39f530cf1d7ae`): does a witness from a session other than `orch-fin-1792994560-7712-23` confirm the stale premise on `main`? Needed because `prd-close` status `stale` requires a `witness_dispatch_id` made under another session. This session's own dispatches cannot bind it.

## answered by the orient receipt (no mutable)

- U1 `onboardingReadiness` absent from the tree and upstream `main`: local literal scan 0 source hits; upstream `store.js` 0 occurrences; no upstream commit after `1bc78c61` adds it (compare `1bc78c61170a...main`, 0 added lines).
- U2 `providerUsable` has a live consumer outside `store.js`: `ModelsSection.js:3` and `:183`.
- U3 no uncommitted lane touches `store.js` or `ModelsSection.js`: `git_status` scoped, `dirty: false`.

## not required by this row

- The witness plan's fresh-profile onboarding check tests behaviour across an edit. This row makes no edit, so before and after are the same tree, and the removed body had 0 callers. No browser lane is opened.

Next: `gm-eliminate` (U4 is open).
