# Client Modules

The web plugin table: the Node half of the client module system in [@freddie/freddie-client-modules](../../packages/client/modules), provided as `ctx.clientModules` (`ClientModuleRegistry`). It scans the host Loader's entries for packages declaring `freddie.client`, composes the `window.__FREDDIE_BOOT__` entry graph, serves each package's `src/` tree under `/plugins/<id>/~<rev>/<path>`, and answers every index-injection collection with the boot manifest rows and import-map entries — the four faces of one service. It is an optional capability of the web GUI stack, not part of the agent-loop spine, and it is a consumer of [@freddie/freddie-host-webserver](../../packages/host/webserver): the carrier described in [web-server.md](web-server.md) supplies the prefix route and the `webserver/index-inject` event this service answers. The same package's browser half (`ctx.modules`, the native-ESM module system that imports these rows) is kernel machinery documented in the [package README](../../packages/client/modules/README.md), not here.

Source: [`packages/client/modules/src/client/manifest.js`](../../packages/client/modules/src/client/manifest.js) (the wire parser; the row shape is composed in [`packages/client/modules/src/index.js`](../../packages/client/modules/src/index.js))

## The wire

The graph is the wire single source between the Node and browser halves: the host composes `WebBootEntry` rows from scanned packages, publishes the graph as a `global` injection row rendered ahead of later script rows (`globalThis["__FREDDIE_BOOT__"]`, with `<` escaped so plugin-controlled strings cannot break out of the script element), and the shell parses it before booting anything. A page without a valid manifest cannot boot — the browser-side parser throws loud on a missing or malformed graph.

```ts type-equiv
/**
 * One composed client entry pushed by the host (a graph row). Wire
 * single source: the host node half (package root) produces this same shape.
 * `immediately` marks stage-one prefetch; `inject` is informational graph
 * metadata (the authoritative edges live in each package's `freddie.client`
 * declaration and reach fibers through entry creation). `external` carries
 * module-graph edges: unlike `inject`, they constrain code arrival because
 * `require` is synchronous (see {@link WebBootGraph.entries}).
 */
interface WebBootEntry {
  /** Entry name == package name. */
  id: string
  /** Entry file URL, '/plugins/<id>/~<rev>/<entry path under src/>'. */
  url: string
  /** Content hash of the package's `src/` tree (the `~<rev>` URL segment). */
  rev: string
  /** Package-name dependency edges, informational (preflight display / HMR diffing). */
  inject?: string[]
  /** Stage-one prefetch mark: load the script for factory registration during module-face boot. */
  immediately?: boolean
  /** Non-baseline module specifiers this row requests; omitted when it requests none. */
  external?: string[]
}
```

```ts type-equiv
/** The composed client entry graph the host injects as `window.__FREDDIE_BOOT__`. */
interface WebBootGraph {
  /** Consistency anchor over the whole graph (content + bundle hashes). */
  rev: string
  /**
   * Composed entries in module-graph order — a dynamic package row precedes
   * rows whose `external` requests that package. Cordis activation order is
   * unrelated and remains owned by fiber service waiting.
   */
  entries: WebBootEntry[]
}
```

Each row's `rev` is the content hash of the package's `src/` tree and rides the URL as the `~<rev>` path segment, so every sibling import shares the cache key; the graph `rev` hashes the composed rows, so any row change changes it. `immediately` marks the stage-one prefetch tier (imported during module-face boot); a lazy row is imported on first use.

## The scan

A package joins the table by declaring `freddie.client` (`platform: 'web'`, optional `inject` edges, optional `immediately`) in its package.json and exporting its browser entry at `exports["./client"]`, which must live under the package's `src/` tree. Package resolution anchors at the config tree's `ctx.baseUrl` — the cordis.yml directory, whose package declares every composed plugin as a dependency — and construction throws when that anchor is unset.

Scanning is incremental per package; there is no full-rescan code path. Every cordis `internal/plugin` emission (fiber construction or disposal) marks the fiber's entry name dirty, and a microtask flush reconciles each dirty name against the live loader entries. The activation pass seeds the same dirty set with all current entries and flushes synchronously, so first scan and steady state share one implementation — with opposite failure postures. At activation, a malformed declaration or missing client entry directory among the already-loaded entries aggregates into one loud `AggregateError` listing every broken package: the fiber FAILS and the boot's fail-loud sweep reports it. In steady state, a broken package logs a warning and must not poison the others.

Package metadata — including the negative "not a client package" verdict — is cached per name and never expires: plugin-set changes take effect on restart. A fiber restart reuses its row and rev untouched; content changes reach the graph only through `rebuilt()`.

## The bundle route and index injection

`GET`/`HEAD /plugins/<id>/~<rev>/<path>` serves any file under the registered package's `src/` tree from disk (the longest registered id that prefixes the path wins, since an id can carry a scope slash): a request naming the row's current rev answers `cache-control: public, max-age=31536000, immutable`, any other or absent rev segment answers `no-cache`; other methods are 405. An unknown id, a path that escapes the tree, or an unreadable file answers a loud 404, so no missing file falls through to the SPA fallback as JavaScript. `GET`/`HEAD /workspace/<specifier>` serves a workspace wire module through Node's own package resolution, redirecting to the real file path when the package's `exports` publish the specifier elsewhere. The injection rows carry the import map, the `modulepreload` hints of the `immediately` rows, and the current graph on every index render, so a reload always boots against the live composition.

## The service

`ClientModuleRegistry` (`ctx.clientModules`, defined in [`packages/client/modules/src/index.js`](../../packages/client/modules/src/index.js)) exposes reads and the rebuild face; signatures are in the generated [service catalog](#ctxclientmodules--clientmoduleregistry). `graph()` returns the current composed graph (a stable object between changes) and `clientPath(id)` the entry file's absolute path. `rebuilt(id)` is the only entry point through which content reaches the graph: it re-hashes the package's `src/` tree, and only a real rev change recomposes the graph and notifies. `onRebuilt` fires per changed row with the new rev; `onGraphChanged` fires after any flush that recomposed the graph (row added or removed, or a rebuilt rev change) and is pull-model — listeners re-read `graph()`. Both notification paths contain listener exceptions so one throwing subscriber cannot skip later subscribers or kill whatever triggered the flush.

In development, [@freddie/freddie-client-hmr](../../packages/client/hmr/README.md) is the registry's watch driver: its node half watches every graph row's `src/` tree (`fs.watch`, or polling where `usePolling` is set), calls `rebuilt(id)` on change, resyncs its watch set through `onGraphChanged`, and broadcasts rev changes to the browser half over SSE. Production graphs omit the HMR row entirely; the module host itself never watches files.

<!-- BEGIN cordis-surface (hand-maintained) -->

<a id="cordis-surface"></a>

## Cordis API

Originally generated from source by `scripts/gen-cordis-catalog.ts`; that script and its `verify-cordis-catalog` freshness check no longer exist, so this region is maintained by hand and must be updated alongside the code it describes. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxclientmodules--clientmoduleregistry"></a>

### `ctx.clientModules` — `ClientModuleRegistry`

The web plugin table service: incremental `freddie.client` scan + wire composition + bundle route + index injection rows. Construction runs the activation scan synchronously — a malformed declaration or missing client entry directory among the already-loaded entries aggregates into one loud throw (FAILED fiber; the boot activation audit reports it).

```ts cordis-catalog
/**
 * Current composed entry graph (stable object between changes).
 * @returns the graph served as `window.__FREDDIE_BOOT__`.
 */
graph(): WebBootGraph

/**
 * Absolute path of an entry's client entry file.
 * @param id - entry id (package name).
 * @returns the path, or undefined for an unknown id.
 */
clientPath(id: string): string | undefined

/**
 * Absolute directory served verbatim for an entry (its package's `src/`
 * directory, which holds the client entry file and the node half beside
 * it — every `.js`/`.js.map` file under it is a real reachable route).
 * @param id - entry id (package name).
 * @returns the directory, or undefined for an unknown id.
 */
clientRoot(id: string): string | undefined

/**
 * Current wire row for one entry after graph composition.
 * @param id - entry id (package name).
 * @returns the current graph row, or undefined for an unknown id.
 */
graphRow(id: string): WebBootEntry | undefined

/**
 * Re-hash one entry's whole served directory (the HMR watch's registration
 * hook — the only entry point through which content changes reach the
 * graph).
 * @param id - entry id (package name).
 * @returns the new rev, or undefined for an unknown id.
 */
rebuilt(id: string): string | undefined

/**
 * Subscribe to bundle rebuilds; fires only when the re-hash changed the rev.
 * @param listener - receives the entry id and its new bundle rev.
 * @returns the unsubscriber.
 */
onRebuilt(listener: (id: string, rev: string) => void): () => void

/**
 * Fires after any flush that recomposed the graph (row added/removed, or a
 * rebuilt rev change). Pull model: listeners re-read {@link graph}.
 * @param listener - notified with no payload.
 * @returns the unsubscriber.
 */
onGraphChanged(listener: () => void): () => void
```

Source: [`packages/client/modules/src/index.js`](../../packages/client/modules/src/index.js)
<!-- END cordis-surface -->
