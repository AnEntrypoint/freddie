# @freddie/cosmokit

A collection of common utilities — the foundation library the rest of the
framework layer builds on. Plain JavaScript, no build step; `main` and `exports`
resolve straight to `src/index.js`.

This package is one of the harness's first-party framework packages. It descends
from the upstream `cosmokit` project but is no longer tracked against it. See
[`framework/README.md`](../README.md) for the layer overview, the full package
table, and the divergence log.

## Usage

`@freddie/cosmokit` is a workspace package. Harness packages depend on it through
the workspace (`"@freddie/cosmokit": "workspace:^"`); it resolves to this
directory via `pnpm-workspace.yaml`. There is nothing to install separately when
working in this repository.

```js
import cosmokit from '@freddie/cosmokit'
```
