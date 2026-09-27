# freddie-chunked-list

Persistent (structural-sharing) append-only lists: appending copies at most one 64-value chunk instead of the whole list, and every older chunk is shared by reference between the old and new heads. Intended for durable checkpoint data that grows by repeated appends and is periodically snapshotted to disk or a session log — a plain array forces either a full copy per append (to stay immutable) or losing structural sharing (to stay cheap); this gives both.

## Surface

```js
import { appendChunkedList, chunkedListSchema, iterateChunkedList } from '@freddie/freddie-chunked-list'
import { z } from 'zod'

let head // ChunkedList<string> | undefined
head = appendChunkedList(head, 'a')
head = appendChunkedList(head, 'b')

for (const value of iterateChunkedList(head)) {
  // 'a', 'b', in insertion order
}

const schema = chunkedListSchema(z.string())
schema.parse(head) // throws on an empty/oversized chunk or an unknown field
```

- **`appendChunkedList(head, value)`** never mutates `head`. While the newest chunk has room (under 64 values) it copies only that chunk; once full, it starts a fresh chunk pointing at the old head, which no longer needs copying at all.
- **`iterateChunkedList(head)`** walks chunk-to-`previous` to collect the chain (O(N / 64) scratch for that walk), then yields every value in original insertion order — O(N) overall, without truncating older chunks.
- **`chunkedListSchema(valueSchema)`** returns a recursive Zod schema for validating a serialized checkpoint: each chunk must have 1–64 values of the caller's shape and no unknown fields (`.strict()`).

## Model Experience

None, as this is a pure in-memory/serialization data structure; nothing here reaches a model request.

#### KV Cache effect

None; nothing here enters a request prefix.

## Known Limitations and Deferred Work

- **No consumer yet.** This ports the upstream primitive; freddie has no durable checkpoint structure using it today. `@freddie/freddie-session-persistence`'s append-only JSONL log is the closest existing candidate for a future migration, evaluated separately since it has its own durability and format-version constraints.
- **No removal or random access** — only append and full forward iteration, matching the upstream primitive. A consumer needing indexed reads or truncation needs a different structure.
