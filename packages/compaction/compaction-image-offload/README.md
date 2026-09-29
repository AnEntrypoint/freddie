# @freddie/freddie-compaction-image-offload

Durable image offload for image-capable routes. When a model request fails with `IMAGE_OFFLOAD_REQUIRED` and names how many retained images must go, the plugin records one `image/offload` decision, lands it as durable surface replacements, and returns `{ kind: 'retry' }` through `agent/request-error`. Every later request sends placeholder text for those occurrences.

This is a function plugin on the agent loop's failure seam — not a compaction backend, not a `ctx.compaction` engine, and not a tool. It composes with [`freddie-compaction-basic`](../compaction-basic/README.md) and [`freddie-compaction-tool-result-pruner`](../compaction-tool-result-pruner/README.md) without either one.

## Use this package

There is no configuration. `Config` is the empty schemastery object, so unrecognized keys still fail at plugin construction.

```js
import * as compactionImageOffload from '@freddie/freddie-compaction-image-offload'
import * as compactionImageOffloadInvariant from '@freddie/freddie-compaction-image-offload/invariant'

export function apply(ctx) {
  ctx.plugin(compactionImageOffload)
  ctx.plugin(compactionImageOffloadInvariant)
}
```

An image-capable adapter opts in by ending its failure with `{ code: 'IMAGE_OFFLOAD_REQUIRED', offloadImages: <count> }`. No adapter in this workspace reports a count today; see Known Limitations.

## Understand the implementation

- **`image/offload` event** — `{ targets: Array<{ seq, imageIndexes }> }`. It carries no `surfaceOp`, so it never appears on the surface; it is appended with the envelope's `ignorable` marker because the generated persistence vocabulary names only the types present when `gen-persistence-catalog` last ran.
- **`selectOldestImageTargets(session, sourceEventSeqs, count)`** — walks the input message events in the failed request's order and takes image occurrences in depth-first order, including images nested inside `tool-result` blocks. Assistant nodes carry model output and are skipped.
- **`offloadOldestImages(session, sourceEventSeqs, count)`** — computes the projection once, appends the decision, then lands one replacement per contributing node: a `user/message` or `tool/result` carrying `{ surfaceOp: { op: 'replace', start: seq, end: seq }, sourceEventSeqs: [seq] }`. The complete original event stays in the append-only log for persistence, replay, and inspection.
- **`imageOffloadProjection`** — validates the decision and reconstructs the replacement messages, so a detached replay reproduces exactly what the live session produced.
- **`./invariant`** — registers the package-owned checks with `ctx.invariants`: nonempty targets, canonical `seq` and `imageIndexes`, no duplicate sequences, `user/message` or `tool/result` sources, and strictly increasing indexes.

Oldest occurrences go first, so the most recent images survive. A request that names more images than remain offloads what exists and still reports progress; a request that names none returns no retry, so recovery cannot loop.

## Model Experience

### Offloaded image

#### What the model sees

Freddie's `OFFLOADED_IMAGE_TEXT` — *"[image omitted to keep the request within its image limit; older images are omitted first. If this image is still needed, read its file again when a path is available; otherwise ask the user to attach it again.]"* — in place of the image block, at the block's original index. Surrounding text, tool-result structure, and block order are unchanged, and the model sees no second copy of the image.

#### Token effect

The placeholder replaces the image payload in every later request. Offload itself makes no model call, and no summarization runs: the retry reuses the loop's ordinary request derivation over the replaced surface.

#### KV Cache effect

Replacing an earlier node invalidates reuse from the first changed token. The untouched prefix stays eligible while its route, envelope, and preceding history remain identical.

## Known Limitations and Deferred Work

- **No adapter in this workspace raises `IMAGE_OFFLOAD_REQUIRED`** — freddie's image-capable routes bound image payloads transiently inside the request path (`offloadRequestImagesWithPolicy`), so they never surface a count. This package therefore owns the code and the durable mechanism and waits for an adapter that reports one.
- **`compaction/summary-error` was not ported** — upstream also offloads when summarization itself fails with the same code. Freddie's compaction seam has no summary-error event, so that listener has nothing to attach to.
- **The O(1) token-meter projection folds these replacements with zero delta** — `foldSurfaceProjection` arms claims only from `compaction/summary` and `compaction/prune`, so an offloaded surface can read as an over-estimate under the projection. `measure()` stays exact.
- **Offload is permanent and one-way** — no event restores an offloaded image. The original survives only in the append-only log, not on the surface.
- **Occurrence indexes are positional** — an index names the nth image in depth-first order at projection time, not a stable identity attached to the image.
