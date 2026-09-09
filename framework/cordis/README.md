# @freddie/cordis

Cordis is a plugin framework for applications that need explicit dependency
injection, scoped services, lifecycle-managed cleanup, and optional
configuration-driven loading. This package is the kernel: context, plugin
registry, fiber lifecycle, events, services, and the logger.

It is one of the harness's first-party framework packages. Source is plain
JavaScript — `src/*.js`, no build step, `main`/`exports` resolving straight to
`src/index.js`. See [`framework/README.md`](../README.md) for the layer
overview, the full package table, and the divergence log (notably the fiber
reentrant-disposal hardening and lazy config resolution that shape this
kernel's lifecycle guarantees).

## Usage

`@freddie/cordis` is a workspace package. Harness packages depend on it through
the workspace (`"@freddie/cordis": "workspace:^"`); `pnpm-workspace.yaml`
resolves that name to this directory. There is nothing to install separately
when working in this repository.

Cordis is ESM-first and runs on current Node releases.

## Quick Start

```js
import { Context, Service } from '@freddie/cordis'

class Counter extends Service {
  value = 0

  constructor(ctx) {
    super(ctx, 'counter')
  }

  next() {
    return ++this.value
  }
}

const greeter = Object.assign((ctx) => {
  ctx.on('app/ready', (message) => {
    ctx.logger.info('%s #%d', message, ctx.counter.next())
  })
}, {
  inject: ['counter'],
})

const root = new Context()
await root.plugin(Counter)
await root.plugin(greeter)

root.emit('app/ready', 'started')
await root.fiber.dispose()
```

The important pieces are:

- `new Context()` creates the root dependency container.
- `ctx.plugin()` starts a plugin and returns a `Fiber`.
- `inject` tells Cordis which services must exist before the plugin runs.
- Effects, event listeners, and services are removed when their owning fiber is
  disposed.

## The framework layer

| Package | Purpose |
| --- | --- |
| `@freddie/cordis` | Core context, plugin registry, fiber lifecycle, events, services, and logger. |
| `@freddie/cordis-plugin-loader` | Runtime plugin tree and loader service. |
| `@freddie/cordis-plugin-include` | YAML/JSON config-file include support for the loader. |
| `@freddie/cordis-plugin-group` | Nested plugin groups for loader configs. |
| `@freddie/cordis-plugin-hmr` | Hot module replacement for loader-managed plugins. |
| `@freddie/cordis-plugin-logger-console` | Console exporter for the built-in logger. |
| `@freddie/cordis-plugin-timer` | Disposal-aware timeout, interval, throttle, and debounce helpers. |
| `@freddie/cosmokit` | Shared utilities used across the framework layer. |
| `@freddie/schemastery` | Schema validator used for plugin config. |

The name mapping from the pre-rescope package names is restated for consumers
in [`docs/rescope.md`](../../docs/rescope.md).

## Working on this package

Edit it directly, like anything under `packages/`. There is no upstream sync
step. Verify by booting a real composition that exercises the Loader/Include
chain end to end — the reentrancy and ordering behavior this kernel guarantees
is not visible in a static read. See [`framework/AGENTS.md`](../AGENTS.md).
