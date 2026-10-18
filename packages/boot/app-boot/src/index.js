import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import * as yaml from 'js-yaml'
import { Context } from '@freddie/cordis'
import Loader from '@freddie/cordis-plugin-loader'
import Include, { applyEntryPatches, entryListSchema } from '@freddie/cordis-plugin-include'
import Group from '@freddie/cordis-plugin-group'
import { freddieHomePath, resolveFreddieHome } from '@freddie/freddie-home-paths'
import { createLaunchEnvironmentSnapshot } from '@freddie/freddie-launch-environment'

export {
  composeEntries,
  DEFAULT_PROFILE_BUNDLES,
  healProfilesModuleFallback,
  initProfile,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  PROFILE_TEMPLATES,
  PROFILES_DIR,
  readProfileManifest,
  resolveBundleDir,
  resolveProfileDir,
  writeProfileManifest,
} from './profile.js'

export function resolveConfigPath(
  configPath, snapshotMode, cwd = process.cwd(),
) {
  const absolute = resolve(cwd, configPath)
  if (snapshotMode !== 'replay') return absolute
  const dir = dirname(absolute)
  const replayName = basename(absolute).replace(/cordis\.ya?ml$/, 'cordis.snapshot.yml')
  return resolve(dir, replayName)
}

export function loadEnv(
  binName, dir = process.cwd(),
  warn = line => void process.stderr.write(line),
) {
  try {
    process.loadEnvFile(resolve(dir, '.env'))
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      warn(`${binName}: failed to load .env: ${String(error)}\n`)
    }
  }
}

const BOOTSTRAP_NAMES_BY_CATEGORY = {
  processLaunchAndModuleResolution: [
    'PATH', 'HOME', 'USERPROFILE', 'SHELL',
    'NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS',
    'LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT',
  ],
  interpreterStartupHooks: [
    'BASH_ENV', 'ENV', 'SHELLOPTS', 'BASHOPTS',
    'PERL5OPT', 'PERL5LIB', 'PYTHONSTARTUP', 'PYTHONPATH', 'RUBYOPT', 'RUBYLIB',
    'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS',
    'PYTHONHOME',
  ],
  versionControlHooksConfigRedirectsAndCommandSelectors: [
    'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_EXTERNAL_DIFF', 'GIT_PAGER', 'GIT_EDITOR',
    'GIT_ASKPASS', 'SSH_ASKPASS',
    'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_COUNT',
    'EDITOR', 'VISUAL', 'PAGER', 'BROWSER',
  ],
  networkReachAndTrust: [
    'DEEPSEEK_BASE_URL', 'DEEPSEEK_SEARCH_BASE_URL',
    'SSL_CERT_FILE', 'SSL_CERT_DIR',
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE',
    'NODE_TLS_REJECT_UNAUTHORIZED',
  ],
}

const BOOTSTRAP_NAMES = new Set(Object.values(BOOTSTRAP_NAMES_BY_CATEGORY).flat())

const BOOTSTRAP_PREFIXES = ['FREDDIE_', 'XDG_', 'DYLD_', 'BASH_FUNC_']

function isBootstrapOnly(name) {
  const upper = name.toUpperCase()
  return BOOTSTRAP_NAMES.has(upper) || BOOTSTRAP_PREFIXES.some(prefix => upper.startsWith(prefix))
}

function readEnvLayer(
  binName, dir, warn,
) {
  const path = resolve(dir, '.env')
  let content
  try {
    content = readFileSync(path, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      warn(`${binName}: failed to load .env: ${String(error)}\n`)
    }
    return undefined
  }
  const values = parseEnv(content)
  for (const name of Object.keys(values)) {
    if (!isBootstrapOnly(name)) continue
    throw new Error(
      `${binName}: ${path} sets "${name}", which only the launching environment may set`
      + ' (it decides how this process starts, where its code and instructions load from, or how it'
      + ` reaches the network); export ${name} instead of putting it in a .env file`,
    )
  }
  return { path, values }
}

export function loadLayeredEnv(
  binName, cwd = process.cwd(),
  warn = line => void process.stderr.write(line),
) {
  const home = resolveFreddieHome()
  const inherited = { ...process.env }
  const project = readEnvLayer(binName, cwd, warn)
  const user = home === resolve(cwd) ? undefined : readEnvLayer(binName, home, warn)
  for (const layer of [project, user]) {
    if (layer === undefined) continue
    for (const [name, value] of Object.entries(layer.values)) {
      if (process.env[name] === undefined) process.env[name] = value
    }
  }
  return createLaunchEnvironmentSnapshot([
    { source: 'process', values: inherited },
    ...project === undefined ? [] : [{ source: 'project-env', path: project.path, values: project.values }],
    ...user === undefined ? [] : [{ source: 'user-env', path: user.path, values: user.values }],
  ])
}

const bootstrapIncludes = new WeakMap()

const TREE_DISPOSED_WHILE_WATCHER_OPENING = 'INACTIVE_EFFECT'

const userPatchesSchema = entryListSchema

export async function watchUserPatches(
  ctx,
  options,
) {
  const { binName, filename, compose = (patches) => patches } = options
  const hmr = ctx.get('hmr')
  if (hmr === undefined) throw new Error(`${binName}: user patch-layer watching requires the Cordis HMR service`)
  const entry = bootstrapIncludes.get(ctx)
  if (entry === undefined) throw new Error(`${binName}: user patch-layer watching requires the root Include entry`)
  const register = hmr.registerConfig(filename, async () => {
    const { patches: _replacedPatches, ...preservedIncludeOptions } = entry.options.config
    const userPatches = loadOptionalPatches(binName, filename) ?? []
    const patches = compose(userPatches)
    await entry.update({
      config: {
        ...preservedIncludeOptions,
        patches,
      },
    })
  })
  try {
    return await register
  } catch (error) {
    if (error?.code === TREE_DISPOSED_WHILE_WATCHER_OPENING) return async () => {}
    throw error
  }
}

export function loadOptionalPatches(binName, file) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw new Error(`${binName}: failed to read patches ${file}: ${String(error)}`)
  }
  return parsePatchList(binName, file, content, 'patches')
}

export function loadOverlayPatches(binName, file) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch (error) {
    throw new Error(`${binName}: failed to read overlay ${file}: ${String(error)}`)
  }
  return parsePatchList(binName, file, content, 'overlay')
}
function parsePatchList(
  binName, file, content, label,
) {
  let parsed
  try {
    parsed = yaml.load(content, { schema: userPatchesSchema })
  } catch (error) {
    throw new Error(`${binName}: failed to parse ${label} ${file}: ${String(error)}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${binName}: ${label} ${file} must be a top-level YAML array of loader patch entries`)
  }
  parsed.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`${binName}: ${label} entry ${index + 1} in ${file} must be a mapping (a loader patch entry)`)
    }
  })
  return parsed
}

export function renderConfigDump(
  binName,
  absoluteConfigPath,
  layers,
  warn = line => void process.stderr.write(`${line}\n`),
) {
  let content
  try {
    content = readFileSync(absoluteConfigPath, 'utf8')
  } catch (error) {
    throw new Error(`${binName}: failed to read config ${absoluteConfigPath}: ${String(error)}`)
  }
  let parsed
  try {
    parsed = yaml.load(content, { schema: entryListSchema })
  } catch (error) {
    throw new Error(`${binName}: failed to parse config ${absoluteConfigPath}: ${String(error)}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${binName}: config ${absoluteConfigPath} must be a top-level YAML array of entries`)
  }
  const baseLabel = basename(absoluteConfigPath)
  const base = parsed
  const snapshot = (count, warnings) => {
    const flattenedPatchesDetachedFromLayers = structuredClone(layers.slice(0, count).flatMap(layer => layer.patches))
    return applyEntryPatches(base, flattenedPatchesDetachedFromLayers, (message, ...args) => {
      warnings.push(substituteCodePlaceholders(message, args))
    })
  }
  let previous = base
  let previousWarnings = []
  const provenance = base.map(() => ({ origin: baseLabel, patchedBy: [] }))
  let composed = base
  for (let count = 1; count <= layers.length; count += 1) {
    const layer = layers[count - 1]
    if (layer === undefined) continue
    const warnings = []
    composed = snapshot(count, warnings)
    for (const line of warnings.slice(previousWarnings.length)) {
      warn(`${binName}: [${layer.label}] ${line}`)
    }
    const before = previous.map(entry => JSON.stringify(entry))
    for (let index = 0; index < composed.length; index += 1) {
      if (index >= before.length) provenance.push({ origin: layer.label, patchedBy: [] })
      else if (JSON.stringify(composed[index]) !== before[index]) provenance[index]?.patchedBy.push(layer.label)
    }
    previous = composed
    previousWarnings = warnings
  }
  return groupedDump(composed, provenance)
}

function substituteCodePlaceholders(message, args) {
  let index = 0
  return message.replace(/%C/g, () => JSON.stringify(args[index++]))
}

function groupedDump(
  composed,
  provenance,
) {
  const lines = []
  let currentLabel
  let group = []
  const flush = () => {
    if (currentLabel === undefined || group.length === 0) return
    lines.push(`# == ${currentLabel}`)
    lines.push(yaml.dump(group, { schema: entryListSchema, noRefs: true }).trimEnd())
    group = []
  }
  for (let index = 0; index < composed.length; index += 1) {
    const record = provenance[index]
    if (record === undefined) continue
    const label = record.patchedBy.length === 0
      ? record.origin
      : `${record.origin}, patched by ${record.patchedBy.join(', ')}`
    if (label !== currentLabel) {
      flush()
      currentLabel = label
    }
    group.push(composed[index])
  }
  flush()
  return lines.join('\n') + '\n'
}

const PINNED_BOOTSTRAP_INCLUDE_ID = 'include'

export async function mountRootInclude(
  ctx,
  absoluteConfigPath,
  patches = [],
  bareModuleBaseUrl,
) {
  ctx.loader.builtins.include = bareModuleBaseUrl === undefined
    ? Include
    : class HostResolvedRootInclude extends Include {
      import(name, getOuterStack) {
        const specifier = isAbsolute(name) ? pathToFileURL(name).href : name
        if (name.startsWith('.') || name.startsWith('cordis:')) return super.import(specifier, getOuterStack)
        const internal = this.ctx.loader.internal
        if (internal === undefined) return super.import(specifier, getOuterStack)
        return internal.import(specifier, bareModuleBaseUrl, {})
      }
    }
  ctx.loader.builtins.group = Group
  const includeConfig = {
    path: pathToFileURL(absoluteConfigPath).href,
    ...patches.length > 0 ? { patches: [...patches] } : {},
  }
  const rootInclude = {
    id: PINNED_BOOTSTRAP_INCLUDE_ID,
    name: 'cordis:include',
    config: includeConfig,
  }
  const includeId = await ctx.loader.create(rootInclude)
  const loader = ctx.get('loader')
  if (loader === undefined) return undefined
  const entry = loader.resolve(includeId)
  bootstrapIncludes.set(ctx, entry)
  return entry
}

const assembledActivationRejections = new Map()

function retainAssembledRejection(reason) {
  assembledActivationRejections.set(reason, (assembledActivationRejections.get(reason) ?? 0) + 1)
}

function releaseAssembledRejection(reason) {
  const count = assembledActivationRejections.get(reason)
  if (count === undefined || count === 1) {
    assembledActivationRejections.delete(reason)
  } else {
    assembledActivationRejections.set(reason, count - 1)
  }
}

async function observeLoaderRejectionCheckpoint(reasons) {
  for (const reason of reasons) retainAssembledRejection(reason)
  try {
    await new Promise(resolve => setImmediate(resolve))
  } finally {
    for (const reason of reasons) releaseAssembledRejection(reason)
  }
}

export const FAIL_LOUD_RELEASE_TIMEOUT_MS = 2_000

export function installFailLoud(
  binName,
  proc = process,
  release,
) {
  let fatalExitInProgress = false
  const handler = (err) => {
    if (assembledActivationRejections.has(err)) return
    if (fatalExitInProgress) return
    fatalExitInProgress = true
    proc.stderr.write(`${binName}: fatal load failure: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`)
    if (release === undefined) {
      proc.exit(1)
      return
    }
    void (async () => {
      let timer
      const releaseIgnoringItsFailure = (async () => release())().catch(() => {})
      await Promise.race([
        releaseIgnoringItsFailure,
        new Promise((resolve) => {
          timer = setTimeout(resolve, FAIL_LOUD_RELEASE_TIMEOUT_MS)
        }),
      ])
      clearTimeout(timer)
      proc.exit(1)
    })()
  }
  const uninstall = () => void proc.off('unhandledRejection', handler)
  proc.on('unhandledRejection', handler)
  return uninstall
}

export function assertEntriesLoaded(ctx, binName) {
  const failed = [...ctx.loader.entries()].filter(entry => entry.fiber === undefined && !entry.disabled)
  if (failed.length > 0) {
    const names = failed.map(entry => entry.options.name).join(', ')
    throw new Error(`${binName}: plugin(s) failed to load: ${names}; Cordis startup failed because these plugin(s) could not be resolved (see the error(s) logged above)`)
  }
}

const FIBER_PENDING = 0
const FIBER_ACTIVE = 2
const FIBER_FAILED = 3

function formatActivationError(error) {
  return error instanceof Error ? error.stack ?? error.message : String(error)
}

export async function assertEntriesActivated(ctx, binName) {
  assertEntriesLoaded(ctx, binName)
  const failures = []
  const rejectionReasons = []
  for (const entry of ctx.loader.entries()) {
    const fiber = entry.fiber
    if (fiber === undefined || entry.disabled) continue
    const state = fiber.state
    if (state === FIBER_ACTIVE) continue
    if (state === FIBER_FAILED) {
      try {
        await fiber.await()
      } catch (error) {
        rejectionReasons.push(error)
        failures.push(`${entry.options.name}: ${formatActivationError(error)}`)
      }
      continue
    }
    if (state === FIBER_PENDING) {
      const missing = Object.keys(fiber.inject).filter(service => fiber.ctx.get(service) === undefined)
      const subject = missing.length === 1 ? 'service' : 'services'
      failures.push(`${entry.options.name}: pending (waiting for ${subject}: ${missing.join(', ') || 'unknown'})`)
    } else {
      failures.push(`${entry.options.name}: fiber state ${String(state)}`)
    }
  }
  if (failures.length > 0) {
    if (rejectionReasons.length > 0) {
      await observeLoaderRejectionCheckpoint(rejectionReasons)
    }
    const noun = failures.length === 1 ? 'entry' : 'entries'
    throw new Error(`${binName}: ${String(failures.length)} ${noun} did not activate\n${failures.join('\n')}`)
  }
}

const HOST_PREPARATION_FAILED = 'host preparation failed'
const PLUGIN_TREE_FAILED_TO_LOAD = 'plugin tree failed to load'

function deepestCause(error) {
  let deepest = error
  while (deepest instanceof Error && deepest.cause !== undefined) deepest = deepest.cause
  return deepest
}

export async function boot(
  binName,
  absoluteConfigPath,
  patches,
  prepare,
  bareModuleBaseUrl,
) {
  const ctx = new Context()
  let stage = HOST_PREPARATION_FAILED
  try {
    ctx.baseUrl = pathToFileURL(dirname(absoluteConfigPath)).href + '/'
    ctx.provide('freddieHomePath', freddieHomePath)
    await ctx.plugin(Loader)
    await prepare?.(ctx)
    stage = PLUGIN_TREE_FAILED_TO_LOAD
    await mountRootInclude(ctx, absoluteConfigPath, patches, bareModuleBaseUrl)
    await ctx.get('loader')?.await()
    if (ctx.get('loader') === undefined) return ctx
    await assertEntriesActivated(ctx, binName)
    return ctx
  } catch (cause) {
    await ctx.fiber.dispose()
    const detail = cause instanceof Error ? cause.message : String(cause)
    const originalFailure = deepestCause(cause)
    const stack = originalFailure instanceof Error && originalFailure !== cause ? `\n${originalFailure.stack ?? originalFailure.message}` : ''
    throw new Error(`${binName}: ${stage}: ${detail}${stack}`, { cause })
  }
}

export const HARNESS_SOURCE_SECTION = 'harness:source'

export function addHarnessSourceSection(ctx, sourceRoot) {
  const text = `The Freddie implementation checkout is at ${sourceRoot}. The checkout location and current working directory are separate values and may differ; never infer the working directory from this path. Use pwd to determine the current working directory. Use this checkout only to inspect or extend FREDDIE itself.`
  const register = () => {
    const systemPrompt = ctx.get('systemPrompt')
    if (systemPrompt === undefined) return
    systemPrompt.section({
      name: HARNESS_SOURCE_SECTION,
      order: -99,
      text,
    })
  }
  register()
  return ctx.on('internal/service', (name) => {
    if (name === 'systemPrompt') register()
  })
}
