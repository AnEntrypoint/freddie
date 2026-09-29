## Rationale

- `src/compression.js` frame decode loops: a malformed row is swallowed because it cannot prove that an earlier physical prefix committed; the committed-prefix rule that follows decides whether the invalid row is fatal or repairable.
- `src/store.js` predecessor probe: a malformed bounded predecessor may cover `fromSeq`, so its `seq` is still included in `base` and the scanner fails closed.
- `src/schema.js` ownership-failure cleanup: a secondary error during cleanup is swallowed so the original database-ownership failure stays the actionable one.
- Schema-17 physical rows are packed and compressed; the codec is frozen and deliberately not shared with JSONL (`jscpd:ignore` in `codec.js`). Every transaction chains on `txnQueue` because libsql-plugkit-client BEGIN/COMMIT/ROLLBACK are connection-global and overlapping transactions lose work. libsql binds JS `null` as the TEXT `"null"`, so `null` params are rewritten to literal `NULL` in the SQL text; multi-statement SQL executes only its first statement there, so `schema.sql` is split by a closed splitter (no semicolons inside literals); blobs travel as `{"$blob": base64}` markers.
