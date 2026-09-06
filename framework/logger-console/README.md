# @freddie/cordis-plugin-logger-console

Console exporter for the built-in Cordis logger service.

One of the harness's first-party framework packages — see
[`framework/README.md`](../README.md) for the layer overview. It is a workspace
package resolved through `pnpm-workspace.yaml`, not something installed
separately.

## Usage

```js
import { Context } from '@freddie/cordis'
import ConsoleLogger from '@freddie/cordis-plugin-logger-console'

const root = new Context()
await root.plugin(ConsoleLogger, {
  showDiff: true,
  levels: {
    default: 2,
    hmr: 3,
  },
})

root.logger('app').info('started')
```

## Config

| Field | Description |
| --- | --- |
| `colors` | Color support level, or `false` to disable colors. |
| `maxLength` | Maximum rendered line length before truncation. |
| `levels` | Per-logger minimum level map. |
| `showDiff` | Show elapsed time since the previous message. |
| `showTime` | Timestamp template. |
| `label` | Label width, margin, and alignment options. |

The Node entry uses `node:util.inspect` for `%o` and `%O`; the browser entry
passes log arguments through to `console`. The `node`/`default` conditional
export selects between `src/index.js` and `src/browser.js`.
