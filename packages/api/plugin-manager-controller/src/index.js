import { Remote, TypertRemoteService } from '@freddie/freddie-typert-protocol'

export const LOCK = Object.freeze({
  REQUEST_PATH: 'request-path',
  HOST_DEPENDENTS: 'host-dependents',
  CLIENT_DEPENDENTS: 'client-dependents',
  NOT_ADDRESSABLE: 'not-addressable',
})

const REQUEST_PATH_MODULES = Object.freeze(new Set([
  '@freddie/cordis-plugin-hmr',
  '@freddie/freddie-agent-presets',
  '@freddie/freddie-api-gateway',
  '@freddie/freddie-api-plugin-manager-controller',
  '@freddie/freddie-client-connection',
  '@freddie/freddie-client-css-manifest',
  '@freddie/freddie-client-modules',
  '@freddie/freddie-client-ui-settings-plugin-inventory',
  '@freddie/freddie-client-ui-settings-plugins',
  '@freddie/freddie-client-vendor-modules',
  '@freddie/freddie-config-editor',
  '@freddie/freddie-host-apiproxy',
  '@freddie/freddie-host-webserver',
  '@freddie/freddie-plugin-manager',
  '@freddie/freddie-typert-loader',
  '@freddie/freddie-typert-registry',
  '@freddie/freddie-web-app',
  '@freddie/freddie-web-app/startup',
]))

const UNKNOWN_ENTRY_MESSAGE = 'no mounted plugin entry has that id'
const WRITE_FAILED_MESSAGE = 'the profile could not be updated, so the plugin keeps its previous state'

function success(value) {
  return Object.freeze({ ok: true, value: Object.freeze(value) })
}

function rejected(code, message, details = {}) {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message, ...details }) })
}

function isWithin(fiber, ownerUid) {
  for (let current = fiber; current !== undefined; current = current.parent?.fiber) {
    if (current.uid === ownerUid) return true
    if (current.parent?.fiber === current) return false
  }
  return false
}

function owningEntryId(fiber) {
  for (let current = fiber; current !== undefined; current = current.parent?.fiber) {
    if (current.entry !== undefined) return current.entry.id
    if (current.parent?.fiber === current) return undefined
  }
  return undefined
}

function hostDependentsOf(ctx, entry) {
  const owner = entry.fiber
  if (owner === undefined) return new Set()
  const provided = new Set()
  for (const key of Reflect.ownKeys(ctx.reflect.store)) {
    const implementation = ctx.reflect.store[key]
    if (isWithin(implementation.fiber, owner.uid)) provided.add(implementation.name)
  }
  const dependents = new Set()
  for (const runtime of ctx.registry.values()) {
    for (const fiber of runtime.fibers) {
      if (isWithin(fiber, owner.uid)) continue
      if (Object.keys(fiber.inject).some(service => provided.has(service))) {
        dependents.add(owningEntryId(fiber) ?? 'root')
      }
    }
  }
  return dependents
}

function requestsPackage(row, packageName) {
  return [...row.inject ?? [], ...row.external ?? []]
    .some(request => request === packageName || request.startsWith(`${packageName}/`))
}

function clientDependentsOf(rows, packageName) {
  return rows.filter(row => row.id !== packageName && requestsPackage(row, packageName)).length
}

function findEntry(loader, id) {
  for (const entry of loader.entries()) {
    if (!entry.options.group && entry.id === id) return entry
  }
  return undefined
}

export class PluginManagerController extends TypertRemoteService {
  static inject = []

  queue = Promise.resolve()

  constructor(ctx) {
    super(ctx, 'pluginManagerController', { namespace: 'pluginManager' })
  }

  describe() {
    const parts = this.parts()
    if (parts === undefined) return Promise.resolve(this.unavailable())
    const { loader, editor } = parts
    const addressable = new Set(editor.entries())
    const clientRows = this.ctx.get('clientModules')?.graph().entries ?? []
    const entries = []
    for (const entry of loader.entries()) {
      if (entry.options.group) continue
      entries.push({ entryId: entry.id, ...this.verdictOf(entry, addressable, clientRows) })
    }
    return Promise.resolve(success({ entries }))
  }

  setDisabled(request) {
    const run = this.queue.then(() => this.switch(request))
    this.queue = run.then(() => undefined, () => undefined)
    return run
  }

  async switch(request) {
    const parts = this.parts()
    if (parts === undefined) return this.unavailable()
    const { loader, editor, manager } = parts
    const entry = findEntry(loader, request.id)
    if (entry === undefined) {
      return rejected('plugin-manager/unknown-entry', UNKNOWN_ENTRY_MESSAGE, { entryId: request.id })
    }
    const clientRows = this.ctx.get('clientModules')?.graph().entries ?? []
    const { lock } = this.verdictOf(entry, new Set(editor.entries()), clientRows)
    if (lock !== null) {
      return rejected('plugin-manager/protected', `this plugin cannot be switched from the browser (${lock})`, {
        entryId: entry.id,
        lock,
      })
    }
    if (entry.disabled === request.disabled) {
      return success({ entryId: entry.id, disabled: entry.disabled, changed: false })
    }
    try {
      await manager.setPluginDisabled(entry.id, request.disabled)
    } catch (error) {
      this.ctx.logger.error(error)
      return rejected('plugin-manager/write-failed', WRITE_FAILED_MESSAGE, { entryId: entry.id })
    }
    const current = findEntry(loader, request.id)
    return success({
      entryId: request.id,
      disabled: current === undefined ? request.disabled : current.disabled,
      changed: true,
    })
  }

  verdictOf(entry, addressable, clientRows) {
    if (!addressable.has(entry)) return { lock: LOCK.NOT_ADDRESSABLE, dependents: 0 }
    if (REQUEST_PATH_MODULES.has(entry.options.name)) return { lock: LOCK.REQUEST_PATH, dependents: 0 }
    const hostDependents = hostDependentsOf(this.ctx, entry).size
    if (hostDependents > 0) return { lock: LOCK.HOST_DEPENDENTS, dependents: hostDependents }
    const clientDependents = clientDependentsOf(clientRows, entry.options.name)
    if (clientDependents > 0) return { lock: LOCK.CLIENT_DEPENDENTS, dependents: clientDependents }
    return { lock: null, dependents: 0 }
  }

  parts() {
    const loader = this.ctx.get('loader')
    const editor = this.ctx.get('configEditor')
    const manager = this.ctx.get('pluginManager')
    if (loader === undefined || editor === undefined || manager === undefined) return undefined
    return { loader, editor, manager }
  }

  unavailable() {
    return rejected(
      'plugin-manager/unavailable',
      'plugin management is absent: this deployment mounts no plugin manager',
    )
  }
}

const marker = (prototype, method) => ({
  name: method,
  private: false,
  static: false,
  addInitializer: fn => {
    fn.call(Object.create(prototype))
  },
})

Remote('describe')(PluginManagerController.prototype.describe, marker(PluginManagerController.prototype, 'describe'))
Remote('setDisabled')(
  PluginManagerController.prototype.setDisabled,
  marker(PluginManagerController.prototype, 'setDisabled'),
)

export default PluginManagerController
