# @freddie/cordis-plugin-hmr

Hot module replacement for loader-managed Cordis plugins.

One of the harness's first-party framework packages — see
[`framework/README.md`](../README.md) for the layer overview, and its divergence
log for the exact config watching and initial-scan suppression behavior this
plugin carries. It is a workspace package resolved through
`pnpm-workspace.yaml`, not something installed separately.

The HMR plugin watches source files, traces Node's module graph, clears affected
module caches, and reloads only the plugin entries that depend on changed
application files. Changes to the CLI entry's own dependency tree (externals)
take the same in-process reload path; the process does not exit. `snapshot()`
returns a leaf-only journal of recent reload decisions for inspect/debug.

Module watches canonicalize their existing base directory before opening
Chokidar. Exact config watches likewise canonicalize the deepest existing
ancestor, then restore any missing suffix. Callbacks and diagnostics retain the
requested absolute filename, while the native backend receives one filesystem
spelling even when Windows supplied an 8.3 alias.

## Requirements

- `@freddie/cordis-plugin-loader`
- `@freddie/cordis-plugin-timer`
- A runtime that exposes Node's internal module loader. The package throws if
  the loader service has no internal module loader available.

## Usage

```yaml
- id: timer
  name: '@freddie/cordis-plugin-timer'
- id: hmr
  name: '@freddie/cordis-plugin-hmr'
  config:
    root:
      - src
    ignored:
      - '**/node_modules'
      - '**/.*'
    debounce: 100
```

## Config

| Field | Description |
| --- | --- |
| `base` | Optional base directory resolved from `ctx.baseUrl`. |
| `root` | Chokidar roots to watch. Defaults to `['.']`. |
| `ignored` | Picomatch patterns excluded from watch and reload analysis. |
| `usePolling` | Use Chokidar polling instead of native file watchers. Defaults to `false`. |
| `debounce` | Milliseconds to wait before processing a burst of changes. |

## Events

| Event | Description |
| --- | --- |
| `hmr/change` | Emitted for changed files that are not handled by plugin reload or config reload. |
| `hmr/reload` | Emitted after one or more plugin entries are reloaded. |
| `hmr/config-update-failed` | Emitted in parallel when an exact-config refresh fails; the error is normalized and logged. |
