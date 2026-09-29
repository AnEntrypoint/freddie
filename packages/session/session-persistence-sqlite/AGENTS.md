## Rationale

- `src/compression.js` frame decode loops: a malformed row is swallowed because it cannot prove that an earlier physical prefix committed; the committed-prefix rule that follows decides whether the invalid row is fatal or repairable.
- `src/store.js` predecessor probe: a malformed bounded predecessor may cover `fromSeq`, so its `seq` is still included in `base` and the scanner fails closed.
- `src/schema.js` ownership-failure cleanup: a secondary error during cleanup is swallowed so the original database-ownership failure stays the actionable one.
