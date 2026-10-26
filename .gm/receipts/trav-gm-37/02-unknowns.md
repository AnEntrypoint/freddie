# 02-unknowns: trav-gm-37

session: orch-fin-1792994560-7712-22
row: trav-gm-37

Facts the row needs that `01-orient.md` does not prove. Each is recorded with `mutable-add`.

- `trav-gm-37-u1-api-loads`: Does `packages/client/connection/src/client/api.js` still load under plain node, with its four re-exports resolving, at the current tree?
- `trav-gm-37-u2-local-reachable`: Is the removing commit `1bc78c61170a` reachable from local `HEAD` `7bc6fe1f05da`, so the local checkout, not only upstream, lacks `resultOf`?

Not open: whether `resultOf` survives anywhere else in the tree. The literal whole-word scan over all tracked and untracked non-ignored files (4857 scanned, dispatch `1792996529677-1999-a34edcf552d5745d`) returned zero, and the dual scan confirmed `literal_scan_matches: 0`.
