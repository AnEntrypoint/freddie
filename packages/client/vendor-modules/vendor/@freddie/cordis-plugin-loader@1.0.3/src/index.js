import { Context, FiberState, Inject, Service } from '@freddie/cordis'
import { defineProperty, isNullable } from '@freddie/cosmokit'
import { ModuleLoader } from './internal.js'
import { Entry } from './config/entry.js'
import { EntryGroup } from './config/group.js'
import isolate from './config/isolate.js'
import { EntryTree } from './config/tree.js'
import { interpolate } from './config/utils.js'

export * from './config/entry.js'
export * from './config/group.js'
export * from './config/isolate.js'
export * from './config/tree.js'
export * from './config/utils.js'
export * from './internal.js'

export class Loader extends EntryTree {
  envData = process.env.CORDIS_SHARED
    ? JSON.parse(process.env.CORDIS_SHARED)
    : { startTime: Date.now() }

  name = 'loader'
  internal = ModuleLoader.fromInternal()

  builtins = Object.create(null)

  config

  constructor(ctx, config = {}) {
    super(ctx)
    this.config = config
    if (config.baseUrl) {
      this.ctx.baseUrl = config.baseUrl
    }
    const self = this

    defineProperty(this, Service.tracker, {
      associate: 'loader',
      property: 'ctx',
      noShadow: true,
    })

    ctx.reflect.provide('loader', this, this[Service.check])

    ctx.on('internal/config', function (_config, next) {
      const config = next()
      if (!this.entry || this.parent.fiber?.entry === this.entry) return config
      const plugin = this.runtime?.callback
      if (plugin?.[EntryGroup.key]) return config
      return interpolate(this.ctx, config)
    }, { global: true })

    ctx.on('internal/update', async function (config, noSave, next) {
      if (!this.entry || noSave || this.parent.fiber?.entry === this.entry) return next()
      await next()
      const unparse = this.runtime?.Config?.['simplify']
      this.entry.options.config = unparse ? unparse(config) : config
      this.entry.parent.tree.write()
    }, { global: true, prepend: true })

    ctx.on('internal/update', function (config, _, next) {
      if (!this.entry || this.parent.fiber?.entry === this.entry) return next()
      self.showLog(this.entry, 'reload')
      return next()
    }, { global: true })

    ctx.on('internal/plugin', (fiber) => {
      if (fiber.parent[Entry.key] && !fiber.entry) {
        fiber.entry = fiber.parent[Entry.key]
        Inject.resolve(fiber.entry.options.inject, fiber.inject)
      }

      if (fiber.uid) return

      if (!fiber.entry) return

      if (fiber.parent.fiber?.entry === fiber.entry) return

      if (!ctx.registry.has(fiber.runtime.callback)) return

      const treeOwner = fiber.entry.parent.tree.ctx.fiber
      if (!treeOwner.uid || treeOwner.state === FiberState.UNLOADING) return

      if (fiber.entry._disposing) return

      this.showLog(fiber.entry, 'unload')

      if (fiber.entry.disabled) return

      fiber.entry.options.disabled = true
      fiber.entry.parent.tree.write()
    })

    ctx.plugin(isolate)
  }

  write() {
  }

  [Service.check]() {
    const config = Service.prototype[Service.resolveConfig].call(this)
    if (config.await && this.getTasks().length) return false
    return true
  }

  showLog(entry, type) {
    if (entry.options.group || !entry.parent.tree.enableLogs) return
    this.ctx.root.logger?.('loader').info('%s plugin %C', type, entry.options.name)
  }

  locate(fiber = this.ctx.fiber) {
    while (1) {
      if (fiber.entry) return fiber.entry.id
      const next = fiber.parent.fiber
      if (fiber === next) return
      fiber = next
    }
  }

  exit() {
  }

  unwrapExports(exports) {
    if (isNullable(exports)) return exports
    exports = exports.default ?? exports
    if (!exports.__esModule) return exports
    return exports.default ?? exports
  }
}

export default Loader
