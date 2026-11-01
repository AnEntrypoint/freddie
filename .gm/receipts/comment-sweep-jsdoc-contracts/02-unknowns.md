# 02-unknowns: comment-sweep-jsdoc-contracts

Written with `unknown_add` (the verb the gm skill calls `mutable-add`; the verb name is `unknown-add` and needs an explicit `id`, see the friction note in 03-eliminate.md).

| id | unknown | dispatch |
|----|---------|----------|
| jsdoc-block-starts-first-party | Do any first-party, non-vendored JS source files carry a JSDoc block comment (line-leading `/**`)? | 1793543431562-707-f174b413bec3688b |
| jsdoc-literal-hits-are-data | Are the 145 non-vendor `/**` literal occurrences all string data consumed at runtime, not source comments? | 1793543432153-710-68c121f13717c711 |
| vendor-jsdoc-out-of-scope | Is `packages/client/vendor-modules/vendor` third-party upstream source that `packages/AGENTS.md` says to preserve? | 1793543432431-711-38cf095201f2f7c8 |
| row-premise-counts-reproduce | Does the row pre-scan count (281 JSDoc starts across 77 files) reproduce under any first-party scope? | 1793543432709-713-2c24e546ce753de |
| minified-css-js-unscanned | Does the minified-skipped `packages/client/ui-theme/src/styles/design-platform.css.js` contain `/**` comments? | 1793543432988-715-d6d68d6577755cb2 |

No unknown is open for a reason other than the eliminate step.
