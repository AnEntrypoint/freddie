import { stat } from 'node:fs/promises'
import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { bindScopeParent, createScope, scopeOf } from '@freddie/freddie-scope'
import { settingsNamespace } from '@freddie/freddie-settings'
import { freddieHomePath } from '@freddie/freddie-home-paths'
import { discoverPresets, entryListProblem, renderComposition, USER_PRESET_DIR } from './discovery.js'
import { copyComposition, deleteComposition, readComposition } from './authoring.js'
import { mountPreset, serviceForAgent, standingMountFor } from './mount.js'
import { InvalidPresetIdError, PresetExistsError, PresetNotWritableError } from './authoring.js'
import {
  InvalidPresetDefinitionError, PresetIdTakenError, PresetMountError, PRESET_ID, UnknownPresetError,
} from './preset.js'

export const SETTINGS_NAMESPACE = 'agent-presets'

export const AgentPresetSettingsSchema = z.object({
  default: z.string(),
})

export {
  COMPOSITION_FILE, discoverPresets, entryListProblem, renderComposition, scanRoot,
} from './discovery.js'
export {
  METADATA_FILE, readPresetMetadata, renderPresetMetadata,
} from './metadata.js'
export {
  inactiveRows, leakedServices, livePresetMounts, mountPreset, serviceForAgent, standingMountFor,
} from './mount.js'
export {
  copyComposition, deleteComposition, InvalidPresetIdError, PresetExistsError,
  PresetNotWritableError, readComposition, writableRoot,
} from './authoring.js'
export { resolveSessionPreset } from './session.js'
export {
  InvalidPresetDefinitionError, PresetIdTakenError, PresetMountError, PRESET_ID, UnknownPresetError,
} from './preset.js'

export class AgentPresets extends Service {
  static inject = ['loader']

  static Config = z.object({
    default: z.string().required(),
    roots: z.array(z.object({
      path: z.string().required(),
      trust: z.union(['system', 'user']).default('user'),
    })).default([]),
    includeUserRoot: z.boolean().default(true),
  })

  resolvedRoots

  settings

  settingsService

  selfCtx

  constructor(ctx, config) {
    super(ctx, 'agentPresets')
    this.config = config
    this.selfCtx = ctx
    this.resolvedRoots = config.includeUserRoot
      ? [...config.roots, { path: freddieHomePath(USER_PRESET_DIR), trust: 'user' }]
      : [...config.roots]
    ctx.inject(['settings'], (settingsCtx) => {
      this.settings = settingsCtx.settings.register(
        settingsNamespace(SETTINGS_NAMESPACE),
        AgentPresetSettingsSchema,
        { base: { default: config.default } },
      )
      this.settingsService = settingsCtx.settings
      settingsCtx.effect(() => () => {
        this.settings = undefined
        this.settingsService = undefined
      }, 'agentPresets.settings()')
    })

    ctx.on('agent/created', ({ agent }) => {
      if (this.resolvedRoots.length === 0) return
      if (this.composedPreset(agent.ctx) !== undefined) return
      ctx.logger.warn(
        `agent "${agent.id}" was published without joining an agent preset; `
        + 'its tools, prompt sections, and skill catalog resolve against the empty global layer '
        + '(join through AgentPresets.mount() or composeFrom() in the agent factory setup)',
      )
    })

    ctx.on('session/event', (session, event) => {
      if (event.type !== 'agent-preset/selected') return
      ctx.emit('agent-preset/selected', session.id, event.data.agentPreset)
    })
  }

  standing = new Map()

  definitions = new Map()

  bindings = new WeakMap()

  get defaultId() {
    return this.settings?.get().default ?? this.config.default
  }

  async list() {
    const discovered = await discoverPresets(this.resolvedRoots)
    const onDisk = new Set(discovered.map(preset => preset.id))
    const declared = []
    for (const record of this.definitions.values()) {
      if (!onDisk.has(record.preset.id)) {
        declared.push(record.preset)
        record.shadowed = false
        continue
      }
      if (record.shadowed) continue
      record.shadowed = true
      this.selfCtx.logger.warn(
        `agent-presets: preset "${record.preset.id}" was declared by a plugin and is also supplied `
        + 'by a configured root; the deployment-owned preset wins and the declaration is not listed',
      )
    }
    declared.sort((left, right) => {
      const byOrder = (left.order ?? Number.POSITIVE_INFINITY) - (right.order ?? Number.POSITIVE_INFINITY)
      return byOrder === 0 ? left.id.localeCompare(right.id) : byOrder
    })
    return [...discovered, ...declared]
  }

  async resolve(id) {
    const wanted = id ?? this.defaultId
    const presets = await this.list()
    const found = presets.find(preset => preset.id === wanted)
    if (found === undefined) {
      throw new UnknownPresetError(wanted, presets.map(preset => preset.id))
    }
    return found
  }

  async resolveMountable(id) {
    const preset = await this.resolve(id)
    if (preset.broken !== undefined) {
      throw new PresetMountError(preset.id, preset.broken)
    }
    return preset
  }

  async register(definition) {
    const { id, name, description, order, plugins } = definition ?? {}
    if (typeof id !== 'string' || !PRESET_ID.test(id)) throw new InvalidPresetIdError(id)
    const problem = entryListProblem(plugins)
    if (problem !== undefined) throw new InvalidPresetDefinitionError(id, problem)
    if (this.definitions.has(id)) throw new PresetIdTakenError(id, 'declared by another plugin')
    if ((await discoverPresets(this.resolvedRoots)).some(preset => preset.id === id)) {
      throw new PresetIdTakenError(id, 'supplied by a configured preset root')
    }
    const preset = {
      id, trust: 'system',
      ...name === undefined ? {} : { name },
      ...description === undefined ? {} : { description },
      ...order === undefined ? {} : { order },
    }
    const record = { preset, rows: plugins, baseUrl: this.ctx.baseUrl, shadowed: false }
    this.definitions.set(id, record)
    let withdrawn = false
    const withdraw = async () => {
      if (withdrawn || this.definitions.get(id) !== record) return
      withdrawn = true
      this.definitions.delete(id)
      const pending = this.standing.get(id)
      if (pending === undefined) return
      this.standing.delete(id)
      const mounted = await pending.catch(() => undefined)
      if (mounted !== undefined) await mounted.scope.dispose()
    }
    try {
      this.ctx.effect(() => withdraw, `agentPresets.register(${id})`)
    } catch (error) {
      this.definitions.delete(id)
      throw error
    }
    return withdraw
  }

  async mount(agentCtx, id) {
    const agentKey = scopeOf(agentCtx)
    if (agentKey === undefined) {
      throw new Error('agent-presets: refusing to compose an unscoped context; the scope key is what joins an agent to its preset')
    }
    const preset = await this.resolveMountable(id)
    const standing = await this.ensureStanding(preset)
    this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
    return preset
  }

  composeFrom(agentCtx, parentCtx) {
    const agentKey = scopeOf(agentCtx)
    if (agentKey === undefined) {
      throw new Error('agent-presets: refusing to compose an unscoped context; the scope key is what joins an agent to its preset')
    }
    const standing = standingMountFor(parentCtx)
    if (standing === undefined) return undefined
    this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
    return standing.presetId
  }

  composedPreset(agentCtx) {
    return standingMountFor(agentCtx)?.presetId
  }

  get roots() {
    return this.resolvedRoots
  }

  get authorable() {
    return this.resolvedRoots.some(root => root.trust === 'user')
  }

  async read(id) {
    const preset = await this.resolve(id)
    const declaration = this.definitions.get(preset.id)
    if (declaration !== undefined) return renderComposition(declaration.rows)
    return await readComposition(preset)
  }

  async copy(from, id, name) {
    const source = await this.resolve(from)
    if (this.definitions.has(source.id)) {
      throw new PresetNotWritableError(source.id, 'it is declared by a plugin, which owns no directory to copy')
    }
    if ((await this.list()).some(preset => preset.id === id)) {
      throw new PresetExistsError(id)
    }
    await copyComposition(this.resolvedRoots, source, id, name)
    this.standing.delete(id)
  }

  async remove(id) {
    const preset = await this.resolve(id)
    if (this.definitions.has(preset.id)) {
      throw new PresetNotWritableError(preset.id, 'it is declared by a plugin; withdraw that registration instead')
    }
    await deleteComposition(this.resolvedRoots, preset)
    this.standing.delete(id)
    if (this.settings?.get().default !== id) return
    await this.settingsService?.mutate(
      settingsNamespace(SETTINGS_NAMESPACE),
      [{ op: 'unset', path: ['default'] }],
    )
  }

  serviceFor(agent, name) {
    return serviceForAgent(this.ctx, agent, name)
  }

  async recompose(agentCtx, id) {
    const agentKey = scopeOf(agentCtx)
    if (agentKey === undefined) {
      throw new Error('agent-presets: refusing to recompose an unscoped context')
    }
    const preset = await this.resolveMountable(id)
    const standing = await this.ensureStanding(preset)
    const binding = this.bindings.get(agentKey)
    if (binding === undefined) {
      this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key))
    } else {
      binding.rebind(standing.key)
    }
    return preset
  }

  async standingKeyFor(id) {
    const preset = await this.resolveMountable(id)
    return (await this.ensureStanding(preset)).key
  }

  async ensureStanding(preset) {
    const pending = this.standing.get(preset.id)
    if (pending !== undefined) {
      const mounted = await pending
      if (mounted.stamp === undefined) return mounted
      const current = await compositionStamp(preset.path)
      if (current === undefined || sameStamp(mounted.stamp, current)) return mounted
      if (this.standing.get(preset.id) === pending) this.standing.delete(preset.id)
      return this.ensureStanding(preset)
    }
    const declaration = this.definitions.get(preset.id)
    const created = (async () => {
      const key = { agentPreset: preset.id }
      const scope = createScope(this.selfCtx, key)
      try {
        if (declaration !== undefined) {
          await mountPreset(scope.ctx, {
            ...declaration.preset, rows: declaration.rows, baseUrl: declaration.baseUrl,
          })
          return { key, scope }
        }
        const stamp = await compositionStamp(preset.path)
        if (stamp === undefined) {
          throw new PresetMountError(preset.id, `composition file is unreadable: ${preset.path}`)
        }
        await mountPreset(scope.ctx, preset)
        return { key, scope, stamp }
      } catch (error) {
        this.standing.delete(preset.id)
        await scope.dispose()
        throw error
      }
    })()
    this.standing.set(preset.id, created)
    return created
  }
}

async function compositionStamp(path) {
  try {
    const { mtimeMs, size } = await stat(path)
    return { mtimeMs, size }
  } catch {
    return undefined
  }
}

function sameStamp(a, b) {
  return a.mtimeMs === b.mtimeMs && a.size === b.size
}

export default AgentPresets
