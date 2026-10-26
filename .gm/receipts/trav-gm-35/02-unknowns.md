# 02-unknowns: trav-gm-35

session: orch-fin-1792994560-7712-24

Open unknowns (recorded with mutable-add, status unknown):

1. trav-gm-35-node-import-fields: does a Node import of `packages/client/ui-settings-plugins/src/client/fields.js` load and expose `ValueField` with no `SecretField` binding? (gpu-free witness for the row's "behaviour unchanged" clause.)
2. trav-gm-35-main-fields-hash: is `fields.js` byte-identical on upstream `main` and the local checkout? (content hash, not size.)
3. trav-gm-35-row-yml-tracked: is `.gm/prd/trav-gm-35.yml` tracked by git, so the witness_plan correction lands in the publish commit?

Answered by orient, not open: no SecretField importer or literal occurrence (orient 01); the deleted body used only `h` and `css`, both still used by `ValueField` (orient 01).
