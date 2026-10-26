# 11-RES: trav-gm-9

- failure modes, run where possible:
  - `content` not iterable: `for...of` throws before the body, same as before the edit.
  - `block` null or non-object: `block.type` throws; the old `b.type` threw identically (`b = block`).
  - image block without `attachment`: falls through to `rest`, unchanged (`block.attachment !== undefined` is the same predicate as `b.attachment !== undefined`).
  - partial failure: none; the function is synchronous and has no side effects.
- run: the probe on the edited tree covers the text and image branches; the `custom` block takes the `rest` path and does not change the output shape.
