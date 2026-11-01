# 04-edit: comment-sweep-jsdoc-contracts

## Edit
- No source file is edited. 03-eliminate.md found no first-party, non-vendored JSDoc block comment to move, and the non-vendor `/**` text is contract data (typert `jsDoc` fields consumed by `packages/typert/loader`, the slot catalog, the TS emitter template, and one description string). Vendored third-party comments are preserved per `packages/AGENTS.md`.
- The change published for this row is this receipt set (`.gm/receipts/comment-sweep-jsdoc-contracts/01-orient.md` through `04-edit.md`) plus the resolved unknowns in the gm store.

## ACH
- Not written. The row asserts no cause; it asserts a count and a post-state.

## Validate
- The post-state is checked by the verifier lane with the same literal instrument: first-party non-vendor `/**` line-start count must be 0. The positive control (vendor scope, 159 starts) is in 03-eliminate.md so the verifier can confirm the instrument moves.

## Witness target
- Leader hypothesis (SPECIFY): the row's 281 starts are not first-party source comments. Witness: `codesearch literal "/**" glob "packages/**/*.js" exclude "**/vendor*/**"`, then filter for text starting `/**`, expecting 0 line-start hits.
