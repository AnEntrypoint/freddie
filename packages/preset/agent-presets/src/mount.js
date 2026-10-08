import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, Service } from '@freddie/cordis'
import { EntryGroup, EntryTree } from '@freddie/cordis-plugin-loader'
import { Include } from '@freddie/cordis-plugin-include'
import { scopeOf, scopeParentOf } from '@freddie/freddie-scope'
import { PresetMountError } from './preset.js'

const mounted = new WeakMap()

const harnessBase = new WeakMap()

function importFrom(tree, base, name, getOuterStack, relativeBase) {
  const specifier = isAbsolute(name) ? pathToFileURL(name).href : name
  const internal = tree.ctx.loader.internal
  if (base === undefined || internal === undefined) {
    return EntryTree.prototype.import.call(tree, name.startsWith('.') ? name : specifier, getOuterStack)
  }
  if (name.startsWith('cordis:')) return EntryTree.prototype.import.call(tree, name, getOuterStack)
  if (name.startsWith('.')) return internal.import(name, relativeBase ?? tree.ctx.baseUrl, {})
  return internal.import(specifier, base, {})
}

class PresetTree extends Include {
  constructor(ctx, config) {
    super(ctx, config)
    mounted.set(config, { tree: this, fiber: ctx.fiber })
  }

  import(name, getOuterStack) {
    return importFrom(this, harnessBase.get(this.config), name, getOuterStack)
  }

  write() {
  }
}

class InlinePresetTree extends EntryTree {
  static inject = ['loader']
  static [EntryGroup.key] = true

  config

  constructor(ctx, config) {
    super(ctx)
    this.config = config
    mounted.set(config, { tree: this, fiber: ctx.fiber })
  }

  import(name, getOuterStack) {
    return importFrom(this, this.config.baseUrl, name, getOuterStack, this.config.baseUrl)
  }

  write() {
  }

  async* [Service.init]() {
    yield () => this.root.stop()
    await this.root.update(this.config.rows)
  }
}

const mounts = new Set()

function pruneDisposedMounts() {
  for (const mount of mounts) {
    if (mount.fiber.uid === null) mounts.delete(mount)
  }
}

export function livePresetMounts() {
  pruneDisposedMounts()
  return [...mounts]
}

function withinFiber(fiber, root) {
  let current = fiber
  while (true) {
    if (current === root) return true
    const parent = current.parent.fiber
    if (parent === current) return false
    current = parent
  }
}

export function leakedServices(ctx, mount) {
  const store = ctx.reflect.store
  const rootIsolate = ctx.root[Context.isolate]
  const leaked = []
  for (const key of Object.getOwnPropertySymbols(store)) {
    const impl = store[key]
    if (impl === undefined) continue
    if (!withinFiber(impl.fiber, mount)) continue
    if (rootIsolate[impl.name] === key) leaked.push(impl.name)
  }
  return leaked.sort((left, right) => left.localeCompare(right))
}

export function standingMountFor(agentCtx) {
  const agentKey = scopeOf(agentCtx)
  if (agentKey === undefined) return undefined
  const standingKey = scopeParentOf(agentKey)
  if (standingKey === undefined) return undefined
  return livePresetMounts().find(
    candidate => candidate.key === standingKey,
  )
}

export function serviceForAgent(
  ctx,
  agent,
  name,
) {
  const mount = standingMountFor(agent.ctx)
  if (mount === undefined) return undefined
  const store = ctx.reflect.store
  for (const key of Object.getOwnPropertySymbols(store)) {
    const impl = store[key]
    if (impl === undefined) continue
    if (impl.name !== name) continue
    if (withinFiber(impl.fiber, mount.fiber)) return impl.value
  }
  return undefined
}

export function inactiveRows(tree) {
  const lines = []
  for (const entry of tree.entries()) {
    if (entry.disabled) continue
    const fiber = entry.fiber
    if (fiber === undefined) {
      lines.push(`${entry.options.id} (${entry.options.name}): never started`)
      continue
    }
    const missing = Object.keys(fiber.inject).filter(name => fiber.ctx.get(name) === undefined)
    if (missing.length > 0) {
      lines.push(`${entry.options.id} (${entry.options.name}): waiting for ${missing.join(', ')}`)
    }
  }
  return lines
}

function mountDetail(error) {
  if (!(error instanceof Error)) return String(error)
  if (!(error instanceof AggregateError)) return error.message
  return [error.message, ...error.errors.map(cause => `- ${mountDetail(cause)}`)].join('\n')
}

export async function mountPreset(agentCtx, preset) {
  const scope = scopeOf(agentCtx)
  if (scope === undefined) {
    throw new Error(
      `agent-presets: refusing to mount preset "${preset.id}" into an unscoped context; `
      + 'its registrations would apply to every agent in the process',
    )
  }
  const inline = preset.rows !== undefined
  const config = inline
    ? { rows: structuredClone(preset.rows), baseUrl: preset.baseUrl }
    : { path: pathToFileURL(preset.path).href }
  if (agentCtx.baseUrl !== undefined) harnessBase.set(config, agentCtx.baseUrl)
  pruneDisposedMounts()
  const handle = agentCtx.plugin(inline ? InlinePresetTree : PresetTree, config)
  try {
    await handle.await()
    const subtree = mounted.get(config)
    if (subtree === undefined) throw new Error('mounted subtree did not publish its entry tree')
    const { tree, fiber } = subtree
    const unusable = inactiveRows(tree)
    if (unusable.length > 0) {
      throw new Error(`${String(unusable.length)} row(s) did not activate:\n${unusable.join('\n')}`)
    }
    const leaked = leakedServices(agentCtx, fiber)
    if (leaked.length > 0) {
      throw new Error(
        `row(s) published process-global service(s) [${leaked.join(', ')}]; `
        + 'a preset service must sit behind an `isolate` realm or move to the host composition',
      )
    }
    mounts.add({ presetId: preset.id, fiber, key: scopeOf(agentCtx) })
  } catch (error) {
    try {
      await handle.dispose()
    } catch {
    }
    throw new PresetMountError(preset.id, `${mountDetail(error)} (${preset.path})`, { cause: error })
  }
}
