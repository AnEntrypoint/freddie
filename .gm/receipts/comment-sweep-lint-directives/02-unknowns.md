# 02-unknowns: comment-sweep-lint-directives

session: mcp-codemode-3535970-1793542718115-1-14

Open unknowns (recorded with `mutable_add`; ids as listed):

- `cls-u1-first-party-directive-keywords`: does any first-party JS directive keyword remain unscanned (comments mode, broad keyword set, `packages/client/vendor-modules/**` excluded)? Answers whether the first-party count of 0 is complete.
- `cls-u2-vendor-payload-editable`: are vendored payload directives editable under this row (immutable payload and generator drift guard)? Answers whether the 59/38 Pre population is in scope.
- `cls-u3-schedule-v8-claim-sole`: is `packages/schedule/schedule/AGENTS.md:5` the only tree reference to `v8 ignore` directives in `src/domain.js`? Answers the edit target and whether removing the stale line orphans any other reference.

Not an unknown: the edit target is not named by the row (file-less), so the row must be re-scoped with `prd-add` under the same id before any edit, per gm-prd Rules. Its target follows from `cls-u3`.

Next: gm-eliminate.
