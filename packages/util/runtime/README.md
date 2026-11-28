# @freddie/freddie-runtime

Runtime adapter for freddie agent code. Agent packages import Node built-ins and process globals only through subpaths of this package (for example `@freddie/freddie-runtime/fs-promises`, `@freddie/freddie-runtime/process`, `@freddie/freddie-runtime/buffer`). Each subpath exports the names that agent code uses, and it reads them from the installed runtime when it loads.

The composition root installs exactly one runtime before any other module loads. fx hosts import `@freddie/freddie-runtime/install-fx` first; `src/fx.js` maps each of the 25 seams to its `fx:host` module, and no file in `src/` imports a Node built-in (`test/aliases.js` fails on one). Node hosts import `@freddie/freddie-runtime-node/install-node` instead: that is a separate, transitional package (`packages/util/runtime-node`), removed when `fx freddie <profile>` lands. Every other runtime (for example an embedded txiki.js) provides an object with the same shape as `fxRuntime` in `src/fx.js` and calls `installRuntime` itself. A missing install throws on first use.

The txiki.js implementation is src/txiki.js, installed by src/install-txiki.js (import @freddie/freddie-runtime/install-txiki first in a txiki host). Where txiki has no equivalent, the name throws a message that points to docs/fx-split.md (txiki gaps). The contract test in test/ checks every subpath name under both implementations.

## Module names

`src/aliases.json` is the one alias table. Every Node module name freddie imports (`node:fs`, and bare `fs`, which is the same row) is a row that maps to `fx:host`, to a txiki module, or, for the two modules only release tooling imports, to nothing. The row's `seam` is the subpath of this package that provides it, and its `gaps` are the named gaps of fx's host interface. `test/aliases.js` scans every import in the repository and fails when one needs a name that is not in the table, and when shipped code (apps, and package and framework `src`) imports a `node:` or bare built-in module instead of the seam subpath in the row; tooling under `scripts/` and `native/` is exempt.

## Parity fixture

`test/parity-fixture.json` is the Node baseline: for each of the 856 shared parity cases it records the case name, its input (the source of the case's `run`) and its output as Node produces it (`kind` is `value`, `threw` or `undefined`), plus the 4 gap cases with the named-gap message the txiki adapter throws. It is written by `node --openssl-legacy-provider test/parity-fixture.js --write`, which captures twice and refuses to write if any case differs between the runs, and it is identical when captured under a different `TMPDIR`. Without `--write` the same script is the check: it fails when a case is missing from the fixture, when a fixture entry has no case, when a case name repeats, when a case's input changed, when an output differs, or when `parity-cases.js` creates a scratch directory under a hardcoded `/tmp`.

A host other than Node is checked with the two pure helpers exported by `test/parity-cases.js`: run `captureCases()` on that host and pass the result with the parsed fixture to `fixtureProblems(fixture, captured)`; an empty list means the host reproduces every output. The gap section is informational, since a native implementation may replace a gap.
