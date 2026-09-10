# @freddie/webjsx

A minimal library for building web applications with JSX and Web Components,
providing `createElement` (build virtual DOM elements) and `applyDiff`
(diff them onto the real DOM). Plain JavaScript, no build step; `main` and
`exports` resolve straight to `src/index.js`.

This package is one of the harness's first-party framework packages. It
descends from the upstream `webjsx` project but is no longer tracked against
it. See [`framework/README.md`](../README.md) for the layer overview, the
full package table, and the divergence log.

## Usage

`@freddie/webjsx` is a workspace package. Client packages depend on it through
the workspace (`"@freddie/webjsx": "*"`); it resolves to this directory via
`pnpm-workspace.yaml`'s `linkWorkspacePackages`. There is nothing to install
separately when working in this repository.

```js
import { createElement as h } from '@freddie/webjsx'
```
