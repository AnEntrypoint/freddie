# @freddie/cordis-plugin-timer

Disposal-aware timer service for Cordis.

One of the harness's first-party framework packages — see
[`framework/README.md`](../README.md) for the layer overview. It is a workspace
package resolved through `pnpm-workspace.yaml`, not something installed
separately.

## Usage

```js
import { Context } from '@freddie/cordis'
import Timer from '@freddie/cordis-plugin-timer'

const root = new Context()
await root.plugin(Timer)

const dispose = root.timeout(() => {
  root.logger.info('done')
}, 1000)

dispose()
```

Timer handles are registered on the current fiber, so they are cleared
automatically when the plugin that created them is disposed.

## API

| API | Description |
| --- | --- |
| `ctx.timeout(callback, delay)` | Run once and return a disposer. |
| `ctx.timeout(delay)` | Return a promise that resolves after `delay`. |
| `ctx.interval(callback, delay)` | Run repeatedly and return a disposer. |
| `ctx.interval(delay)` | Return an async iterator that yields on each interval. |
| `ctx.throttle(callback, delay, noTrailing?)` | Return a throttled function with `.dispose()`. |
| `ctx.debounce(callback, delay)` | Return a debounced function with `.dispose()`. |

`ctx.setTimeout()` and `ctx.setInterval()` are kept as deprecated aliases for
`ctx.timeout()` and `ctx.interval()`.
