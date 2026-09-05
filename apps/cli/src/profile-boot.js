/**
 * Shared profile boot for every `freddie` surface: resolve the profile, stack its
 * patch layers (bundle layers in `freddie.profile.bundles` order, the profile's
 * own `cordis.patch.yml`, `--patch` overlays, the telemetry switch), mount the
 * tree over the profile's empty root config, keep the profile patch layer
 * live, and wire fail-loud plus bounded shutdown.
 *
 * App flags are not the launcher's business: the invocation's inner arguments
 * are provided to the tree through `ctx.cmdlineArgs`, where any injected app
 * plugin may read the same immutable snapshot.
 * @module @freddie/freddie/profile-boot
 */

import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  boot,
  composeEntries,
  healProfilesModuleFallback,
  installFailLoud,
  loadOptionalPatches,
  loadOverlayPatches,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  watchUserPatches,
} from '@freddie/freddie-app-boot'
import { resolveFreddieHome } from '@freddie/freddie-home-paths'

/** Runtime mirror: FiberState is a cross-package const enum, erased at compile time by cordis's own build. */
const FiberState = { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4, UNLOADING: 5 }

/** Shipped agent-preset root: beside this app's own config, in both source and built layouts. */
const SHIPPED_PRESET_ROOT = fileURLToPath(new URL('../config/agent-presets/', import.meta.url))

// The monorepo checkout's own root, two hops up from apps/cli -- present only
// when this app is running from source inside the workspace (an installed
// `freddie` package has no `packages/` sibling two levels up). cordis-plugin-hmr's
// own `root`/`base` config resolves relative to the PROFILE directory
// (~/.freddie/profiles/<name>/), which shares no files with a dev checkout's
// packages/ tree at all -- pointing it there instead is what makes host-side
// HMR watch source edits a developer actually makes, rather than a directory
// nothing ever writes to.
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const WORKSPACE_PACKAGES_DIR = join(WORKSPACE_ROOT, 'packages')

/**
 * Every `src/` directory under `root`, skipping `node_modules` entirely.
 * Watching this explicit list instead of the whole tree is not an
 * optimization, it is what makes host HMR viable at all here: this
 * checkout's `packages/` alone nests 224+ separate `node_modules` trees, and
 * chokidar (measured directly, isolated from the rest of the app) needed
 * over 30 seconds -- still not ready -- to walk `packages/`+`apps/` with only
 * an `ignored: ['**\/node_modules', ...]` glob to skip them, versus ~1.1s
 * watching the 221 real `src/` directories this returns directly. A glob
 * ignore still has to `readdir` into a directory to test its children
 * against the pattern in the general case; an explicit root list never
 * visits `node_modules` in the first place.
 * @param root - directory to search.
 * @returns absolute paths of every `src` directory found, node_modules excluded.
 */
function findSrcDirs(root) {
  const dirs = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue
    const full = join(root, entry.name)
    if (entry.name === 'src') { dirs.push(full); continue }
    dirs.push(...findSrcDirs(full))
  }
  return dirs
}

import { FREDDIE_LAUNCH_ENVIRONMENT_KEY } from '@freddie/freddie-launch-environment'
import { provideCmdline } from '@freddie/freddie-cmdline'
import { createProcessShutdown } from './process-shutdown.js'

const NAME = 'freddie'

/**
 * The home-level user patch layer (`$FREDDIE_HOME/cordis.patch.yml`), applied
 * over every profile's own layer. Resolved per call, not at module load:
 * `$FREDDIE_HOME` may be set by the test or launcher after import.
 * @returns the absolute patch-file path.
 */
export function homePatchPath() {
  return join(resolveFreddieHome(), PROFILE_PATCH_FILENAME)
}

/** Absolute path of this freddie installation's package.json (both anchors: src/ and lib/ sit one level under apps/cli). */
export const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

/** The session-telemetry row id the FREDDIE_TELEMETRY_DISABLED switch targets. */
const TELEMETRY_ROW_ID = 'session-telemetry-otel'

/** The empty root entry list every profile tree patches over. */
const PROFILE_ROOT_CONFIG = `# freddie profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's freddie.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
`

/** Root config filename inside a profile directory. */
export const PROFILE_ROOT_FILENAME = 'cordis.yml'

/**
 * Resolve the telemetry opt-out switch into its boot patch. ANY non-empty
 * value (including `'0'`/`'false'`) disables: a privacy switch prefers
 * off-by-mistake over on-by-mistake. A composition without the telemetry row
 * exports nothing, so the switch is then trivially satisfied and no patch is
 * generated — custom profiles need not mount telemetry to run with the
 * switch set.
 * @param disabledEnv - the raw `FREDDIE_TELEMETRY_DISABLED` value (`undefined` when unset).
 * @param hasRow - whether the composition carries the telemetry row.
 * @returns the disable patch, or `undefined` when no hard-disable patch is required.
 */
export function resolveTelemetryPatch(disabledEnv, hasRow) {
  if ((disabledEnv ?? '') === '' || !hasRow) return undefined
  return { id: TELEMETRY_ROW_ID, disabled: true }
}

/**
 * Load a resolved profile for `name`: heal the shared module fallback, then
 * (re)write the empty root config. The root is always rewritten: the whole
 * composition is patch layers, and the vendored Loader's tree write-back (a
 * plugin self-disposing persists the current tree) can bake composed rows
 * into this file — which would duplicate every bundle insert on the next
 * boot. The file exists on disk only because the Loader needs a real include
 * root to anchor `baseUrl` at the profile directory (the config dump anchors
 * on the same file, so both compose over the identical base).
 * @param name - the profile name.
 * @param userLayer - `false` skips parsing `cordis.patch.yml` (the default dump).
 * @returns the loaded profile.
 */
export function prepareProfile(name, userLayer = true) {
  healProfilesModuleFallback(INSTALL_ANCHOR)
  const profile = loadProfile(NAME, name, INSTALL_ANCHOR, undefined, { userLayer })
  writeFileSync(join(profile.dir, PROFILE_ROOT_FILENAME), PROFILE_ROOT_CONFIG)
  return profile
}

/** The full patch stack of one composed profile, in application order. */
function allPatches(composed) {
  return [
    ...composed.bundlePatches,
    ...composed.profile.patches,
    ...composed.homePatches,
    ...composed.overlays,
  ]
}

/**
 * Load `name` and compose its effective patch stack: bundle layers in
 * `freddie.profile.bundles` order (the base bundle gates the shell stacks by
 * platform on its own rows), the profile's user layer, the home-level user
 * layer (`$FREDDIE_HOME/cordis.patch.yml` — machine-local preferences that apply
 * to every profile, so it outranks the per-profile layer), `--patch` overlays,
 * then the telemetry switch.
 * @param name - the profile name.
 * @param patchFiles - `--patch` overlay paths, in argv order.
 * @returns the profile, its patch layers, and the composed row index.
 */
function composeProfile(name, patchFiles) {
  const profile = prepareProfile(name)
  const homePatches = loadOptionalPatches(NAME, homePatchPath()) ?? []
  const overlays = patchFiles.flatMap(file => loadOverlayPatches(NAME, resolve(file)))
  const bundlePatches = profile.layers.flatMap(layer => layer.patches)
  const rows = new Map()
  for (const row of composeEntries([bundlePatches, profile.patches, homePatches, overlays])) {
    if (typeof row.id === 'string') rows.set(row.id, row)
  }
  const composedOverlays = [...overlays]
  // The SHIPPED root is the part of the roster only this app can resolve: it
  // sits beside this app's own config, in both the source and built layouts.
  // The writable root the roster appends is `freddie-agent-presets`' own, so a
  // launcher that never reaches this patch still finds a person's presets.
  if (rows.has('agent-presets')) {
    composedOverlays.push({
      id: 'agent-presets',
      config: {
        ...(rows.get('agent-presets')?.config ?? {}),
        roots: [{ path: SHIPPED_PRESET_ROOT, trust: 'system' }],
      },
    })
  }
  const telemetryPatch = resolveTelemetryPatch(process.env.FREDDIE_TELEMETRY_DISABLED, rows.has(TELEMETRY_ROW_ID))
  if (telemetryPatch !== undefined) composedOverlays.push(telemetryPatch)
  // Point the shared `hmr` row (when present and not disabled) at the actual
  // workspace source instead of its config-relative default: see
  // WORKSPACE_ROOT's own doc comment for why the default watches nothing a
  // developer edits.
  const hmrRow = rows.get('hmr')
  if (hmrRow !== undefined && hmrRow.disabled !== true && existsSync(WORKSPACE_PACKAGES_DIR)) {
    const srcDirs = [
      ...findSrcDirs(WORKSPACE_PACKAGES_DIR),
      ...findSrcDirs(join(WORKSPACE_ROOT, 'apps')),
    ].map(dir => relative(WORKSPACE_ROOT, dir).split('\\').join('/'))
    composedOverlays.push({
      id: 'hmr',
      config: {
        ...(hmrRow.config ?? {}),
        // `base` resolves as `new URL(config.base, ctx.baseUrl)` inside the
        // hmr plugin -- a bare filesystem path there throws
        // ERR_INVALID_URL_SCHEME (only a URL or a same-scheme relative
        // reference is valid), so this must be the file:// form, not the raw
        // path WORKSPACE_ROOT holds.
        base: pathToFileURL(WORKSPACE_ROOT).href,
        // Explicit src/ roots, not the whole packages/+apps/ tree: see
        // findSrcDirs' own doc comment for the measured 30s+ hang a glob
        // ignore over this checkout's 224+ nested node_modules produces.
        root: srcDirs,
      },
    })
  }
  return { profile, bundlePatches, homePatches, overlays: composedOverlays, rows }
}

/**
 * Re-throw a watcher-setup failure unless a shutdown already owns the tree:
 * a signal aborted this invocation, or an app requested exit (`ctx.appExit`
 * from a fast one-shot) and the root's disposal rejected the in-flight setup
 * await. Either way the failure describes a tree that is exiting as asked,
 * not a broken watch.
 * @param ctx - the booted root context.
 * @param signal - this invocation's signal-shutdown fact.
 * @param error - the setup failure.
 */
function suppressShutdownError(ctx, signal, error) {
  if (signal.aborted) return
  if (ctx.fiber.state !== FiberState.ACTIVE || ctx.get('loader') === undefined) return
  throw error
}

/**
 * Boot one profile invocation end to end and leave process lifetime to the
 * mounted plugins (or to a one-shot runner the composition mounts).
 * @param options - environment snapshot, profile name, overlays, and the booted app's own arguments.
 * @returns the settled root context and the shutdown controller.
 */
export async function runProfile(options) {
  const composed = composeProfile(options.profile, options.patchFiles)
  const app = {}
  const shutdown = createProcessShutdown(async () => { await app.current?.fiber.dispose() })
  const signalShutdown = new AbortController()
  const interrupt = (code) => {
    signalShutdown.abort()
    shutdown.interrupt(code)
  }
  // Signals own teardown throughout the startup window, not only after boot()
  // settles: an inserted provider can publish before sibling rows finish mounting.
  // SIGTERM is a supervisor's ordinary stop request and exits 0 on every
  // surface — the launcher does not know whether the app considered its work
  // complete; SIGINT is a user interrupt and reports 130.
  process.on('SIGTERM', () => { interrupt(0) })
  process.on('SIGINT', () => { interrupt(130) })
  installFailLoud(NAME, process, async () => {
    await app.current?.fiber.dispose()
  })

  const rootConfig = join(composed.profile.dir, PROFILE_ROOT_FILENAME)
  // Recomposition for the live user layers: bundle layers below, overlays
  // above, so a user edit can never displace them. Parsed app arguments are
  // not in here at all — they live in app-provided services that survive a
  // recomposition. BOTH
  // user files are re-read per generation (the HMR watcher hands us only the
  // changed file's patches, which one of the reads duplicates — fresh reads
  // keep the two watchers from stitching in each other's stale copy).
  // Fresh clones per generation: the include pushes `insert` rows into the
  // mounted tree BY REFERENCE and later id-targeted patches mutate those
  // objects in place. Reusing one parsed patch object across applications
  // would bake a user override into the bundle's in-memory insert row, so
  // removing the override could never revert the row to the bundle default.
  const composeLive = () => structuredClone([
    ...composed.bundlePatches,
    ...loadOptionalPatches(NAME, composed.profile.patchPath) ?? [],
    ...loadOptionalPatches(NAME, homePatchPath()) ?? [],
    ...composed.overlays,
  ])
  // Cloned for the same insert-aliasing reason as composeLive: the boot
  // application must not mutate the objects later reloads recompose from.
  const ctx = await boot(NAME, rootConfig, structuredClone(allPatches(composed)), (hostCtx) => {
    app.current = hostCtx
    // Before any config-tree entry mounts, so plugins resolve all launch-time
    // environment values from the same immutable provenance snapshot.
    hostCtx.provide(FREDDIE_LAUNCH_ENVIRONMENT_KEY, options.environment)
    // The command line and bounded exit request are launcher facts available
    // to every app plugin that injects the argument snapshot.
    provideCmdline(hostCtx, {
      args: options.args,
      exit: code => void shutdown.shutdown(code),
    })
  })
  app.current = ctx
  // A surface can dispose the whole tree while boot or this post-boot watcher
  // setup is still in flight — a signal, or a fast one-shot's appExit. Loader
  // presence and fiber state own liveness; the initial check skips a tree
  // that already exited, and the catch below re-checks for an exit that
  // landed mid-setup. Watching is unconditional: a one-shot surface exits
  // through its bounded shutdown, which disposes the watchers before the
  // loop drains.
  if (!signalShutdown.signal.aborted
    && ctx.fiber.state === FiberState.ACTIVE
    && ctx.get('loader') !== undefined) {
    try {
      // Config-only HMR for the live profile patch layer: the web bundle
      // disables the shared module-reload `hmr` row (its reload lifecycle is
      // untested), so when the composition leaves no HMR service, mount a
      // watch-only instance with no module roots — cordis.patch.yml edits stay
      // live on every long-lived surface. A silent skip would break the
      // documented hot-reload contract. HMR injects the timer service, which a
      // bare custom profile may not mount either.
      if (ctx.get('hmr') === undefined) {
        if (ctx.get('timer') === undefined) {
          await ctx.loader.create({ name: '@freddie/cordis-plugin-timer' })
        }
        await ctx.loader.create({ name: '@freddie/cordis-plugin-hmr', config: { root: [] } })
      }
      await watchUserPatches(ctx, {
        binName: NAME,
        filename: composed.profile.patchPath,
        compose: composeLive,
      })
      await watchUserPatches(ctx, {
        binName: NAME,
        filename: homePatchPath(),
        compose: composeLive,
      })
    } catch (error) {
      suppressShutdownError(ctx, signalShutdown.signal, error)
    }
  }
  return { ctx, shutdown }
}
