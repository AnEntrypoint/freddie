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

const FiberState = { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4, UNLOADING: 5 }

const SHIPPED_PRESET_ROOT = fileURLToPath(new URL('../config/agent-presets/', import.meta.url))

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const WORKSPACE_PACKAGES_DIR = join(WORKSPACE_ROOT, 'packages')
const WORKSPACE_FRAMEWORK_DIR = join(WORKSPACE_ROOT, 'framework')

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

export function homePatchPath() {
  return join(resolveFreddieHome(), PROFILE_PATCH_FILENAME)
}

export const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

const TELEMETRY_ROW_ID = 'session-telemetry-otel'

const PROFILE_ROOT_CONFIG = `# freddie profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's freddie.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
`

export const PROFILE_ROOT_FILENAME = 'cordis.yml'

export function resolveTelemetryPatch(disabledEnv, hasRow) {
  if ((disabledEnv ?? '') === '' || !hasRow) return undefined
  return { id: TELEMETRY_ROW_ID, disabled: true }
}

export function prepareProfile(name, userLayer = true) {
  healProfilesModuleFallback(INSTALL_ANCHOR)
  const profile = loadProfile(NAME, name, INSTALL_ANCHOR, undefined, { userLayer })
  writeFileSync(join(profile.dir, PROFILE_ROOT_FILENAME), PROFILE_ROOT_CONFIG)
  return profile
}

function allPatches(composed) {
  return [
    ...composed.bundlePatches,
    ...composed.profile.patches,
    ...composed.homePatches,
    ...composed.overlays,
  ]
}

function findComposedRow(entries, id) {
  for (const entry of entries) {
    if (entry?.id === id) return entry
    const inserted = entry?.insert
    if (inserted !== undefined) {
      const nested = findComposedRow(Array.isArray(inserted) ? inserted : [inserted], id)
      if (nested !== undefined) return nested
    }
  }
}

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
  const hmrRow = rows.get('hmr') ?? findComposedRow(bundlePatches, 'hmr')
  if (hmrRow !== undefined && hmrRow.disabled !== true && existsSync(WORKSPACE_PACKAGES_DIR)) {
    const srcDirs = [
      ...findSrcDirs(WORKSPACE_PACKAGES_DIR),
      ...findSrcDirs(join(WORKSPACE_ROOT, 'apps')),
      ...existsSync(WORKSPACE_FRAMEWORK_DIR) ? findSrcDirs(WORKSPACE_FRAMEWORK_DIR) : [],
    ].map(dir => relative(WORKSPACE_ROOT, dir).split('\\').join('/'))
    const config = {
      ...(hmrRow.config ?? {}),
      base: pathToFileURL(WORKSPACE_ROOT).href,
      root: srcDirs,
    }
    if (rows.has('hmr')) composedOverlays.push({ id: 'hmr', config })
    else bundlePatches.push({ id: 'hmr', config })
  }
  return { profile, bundlePatches, homePatches, overlays: composedOverlays, rows }
}

function suppressShutdownError(ctx, signal, error) {
  if (signal.aborted) return
  if (ctx.fiber.state !== FiberState.ACTIVE || ctx.get('loader') === undefined) return
  throw error
}

export async function runProfile(options) {
  const composed = composeProfile(options.profile, options.patchFiles)
  const app = {}
  const shutdown = createProcessShutdown(async () => { await app.current?.fiber.dispose() })
  const signalShutdown = new AbortController()
  const interrupt = (code) => {
    signalShutdown.abort()
    shutdown.interrupt(code)
  }
  process.on('SIGTERM', () => { interrupt(0) })
  process.on('SIGINT', () => { interrupt(130) })
  installFailLoud(NAME, process, async () => {
    await app.current?.fiber.dispose()
  })

  const rootConfig = join(composed.profile.dir, PROFILE_ROOT_FILENAME)
  const composeLive = () => structuredClone([
    ...composed.profile.layers.flatMap(layer => loadOptionalPatches(NAME, layer.patchPath) ?? []),
    ...loadOptionalPatches(NAME, composed.profile.patchPath) ?? [],
    ...loadOptionalPatches(NAME, homePatchPath()) ?? [],
    ...composed.overlays,
  ])
  const ctx = await boot(NAME, rootConfig, structuredClone(allPatches(composed)), (hostCtx) => {
    app.current = hostCtx
    hostCtx.provide(FREDDIE_LAUNCH_ENVIRONMENT_KEY, options.environment)
    provideCmdline(hostCtx, {
      args: options.args,
      exit: code => void shutdown.shutdown(code),
    })
  })
  app.current = ctx
  const loader = ctx.get('loader')
  if (loader !== undefined) loader.exit = () => { void shutdown.interrupt(75) }
  if (!signalShutdown.signal.aborted
    && ctx.fiber.state === FiberState.ACTIVE
    && ctx.get('loader') !== undefined) {
    try {
      if (ctx.get('hmr') === undefined) {
        if (ctx.get('timer') === undefined) {
          await ctx.loader.create({ name: '@freddie/cordis-plugin-timer' })
        }
        await ctx.loader.create({ name: '@freddie/cordis-plugin-hmr', config: { root: [] } })
      }
      for (const layer of composed.profile.layers) {
        await watchUserPatches(ctx, {
          binName: NAME,
          filename: layer.patchPath,
          compose: composeLive,
        })
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
