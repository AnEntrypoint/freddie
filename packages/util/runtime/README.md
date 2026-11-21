# @freddie/freddie-runtime

Runtime adapter for freddie agent code. Agent packages import Node built-ins and process globals only through subpaths of this package (for example `@freddie/freddie-runtime/fs-promises`, `@freddie/freddie-runtime/process`, `@freddie/freddie-runtime/buffer`). Each subpath exports the names that agent code uses, and it reads them from the installed runtime when it loads.

The composition root installs exactly one runtime before any other module loads. Node hosts import `@freddie/freddie-runtime/install-node` first. Every other runtime (for example an embedded txiki.js) provides an object with the same shape as `nodeRuntime` in `src/node.js` and calls `installRuntime` itself. A missing install throws on first use.

The txiki.js implementation is src/txiki.js, installed by src/install-txiki.js (import @freddie/freddie-runtime/install-txiki first in a txiki host). Where txiki has no equivalent, the name throws a message that points to docs/fx-split.md (txiki gaps). The contract test in test/ checks every subpath name under both implementations.

## Module names

`src/aliases.json` is the one alias table. Every Node module name freddie imports (`node:fs`, and bare `fs`, which is the same row) is a row that maps to `fx:host`, to a txiki module, or, for the two modules only release tooling imports, to nothing. The row's `seam` is the subpath of this package that provides it, and its `gaps` are the named gaps of fx's host interface. `test/aliases.js` scans every import in the repository and fails when one needs a name that is not in the table, and when shipped code (apps, and package and framework `src`) imports a `node:` or bare built-in module instead of the seam subpath in the row; tooling under `scripts/` and `native/` is exempt.
