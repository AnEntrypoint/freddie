# freddie-deque

Zero-dependency circular deque for queues that retain entries across asynchronous work. Several packages drain a FIFO with `array.shift()` (`workflow/graph`, `subprocess-local/spawn`, `e2b/subprocess-e2b/output`, `attachment-local/compression-limiter`), which is O(n) per removal because the engine re-indexes every remaining element. `Deque` gives those call sites an O(1) alternative at both ends without adopting a dependency.

## Surface

```js
import { Deque } from '@freddie/freddie-deque'

const queue = new Deque()
queue.pushBack('a')
queue.pushBack('b')
queue.pushFront('z')
queue.size // 3
queue.popFront() // 'z'
queue.popFront() // 'a'
```

`pushBack`/`pushFront` insert at the tail/head; `popFront` removes and returns the head, or `undefined` when empty — callers whose element type includes `undefined` use `size` to disambiguate. `clear()` drops every entry and releases the backing array. Storage doubles on growth and halves back down once live entries fall to a quarter of capacity, floored at 16 slots, so a burst-then-drain cycle does not hold a permanently oversized buffer.

## Model Experience

None, as this is a pure in-memory data structure; nothing here reaches a model request.

#### KV Cache effect

None; nothing here enters a request prefix.

## Known Limitations and Deferred Work

- **Not yet wired into existing `array.shift()` call sites** — this package ports the primitive; migrating `workflow/graph`, `subprocess-local/spawn`, and similar hot-path queues is a separate, per-call-site change so each swap can be verified against its own real workload.
- **No iteration or peek API** — only `pushBack`/`pushFront`/`popFront`/`clear`/`size` exist today, matching the upstream primitive this ports; add `peekFront`/iteration when a consumer needs one rather than speculatively.
