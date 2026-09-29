/**
 * Host `pluginManager` Remote namespace: which mounted plugin entries a browser
 * may switch, and the one write that switches an entry on or off.
 *
 * The write is a deployment-configuration change that remounts host code, so an
 * entry is switchable only when nothing the request path or the browser shell
 * needs would go down with it. Every verdict is derived from the live Loader and
 * Fiber graph on each call, and anything the derivation cannot prove leaf-like
 * is refused.
 * @module @freddie/freddie-api-plugin-manager-controller
 */

import { Remote, TypertRemoteService } from '@freddie/freddie-typert-protocol'

/** Why an entry cannot be switched from the browser. */
export const LOCK = Object.freeze({
  REQUEST_PATH: 'request-path',
  HOST_DEPENDENTS: 'host-dependents',
  CLIENT_DEPENDENTS: 'client-dependents',
  NOT_ADDRESSABLE: 'not-addressable',
})

/**
 * Modules that answer this request, mount the client that sent it, perform the
 * switch, or are read by them through an optional lookup. No injection edge
 * names these (the connection and the typert loader are reached by route and by
 * manifest, the preset roster by `ctx.get`), so they are listed.
 */
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

/**
 * Whether a fiber is the given fiber or one of its descendants.
 * @param fiber - the fiber to place.
 * @param ownerUid - uid of the candidate ancestor; a Loader entry's fiber is a
 *   wrapper around the registry fiber, so uids identify it where identity would not.
 */
function isWithin(fiber, ownerUid) {
  for (let current = fiber; current !== undefined; current = current.parent?.fiber) {
    if (current.uid === ownerUid) return true
    if (current.parent?.fiber === current) return false
  }
  return false
}

/** Id of the Loader entry a fiber runs under, or undefined for a root-level fiber. */
function owningEntryId(fiber) {
  for (let current = fiber; current !== undefined; current = current.parent?.fiber) {
    if (current.entry !== undefined) return current.entry.id
    if (current.parent?.fiber === current) return undefined
  }
  return undefined
}

/**
 * Ids of the other entries whose fibers require a service the given entry's
 * fiber tree provides. Unloading the entry would park every one of them.
 * @param ctx - context carrying the reflect store and the plugin registry.
 * @param entry - the Loader entry under test.
 */
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

/** Whether a browser module row lists the package as a client dependency or imports one of its subpaths. */
function requestsPackage(row, packageName) {
  return [...row.inject ?? [], ...row.external ?? []]
    .some(request => request === packageName || request.startsWith(`${packageName}/`))
}

/** Number of browser module rows other than the package's own that need it. */
function clientDependentsOf(rows, packageName) {
  return rows.filter(row => row.id !== packageName && requestsPackage(row, packageName)).length
}

function findEntry(loader, id) {
  for (const entry of loader.entries()) {
    if (!entry.options.group && entry.id === id) return entry
  }
  return undefined
}

/** Host Remote namespace owner for enabling and disabling mounted plugin entries. */
export class PluginManagerController extends TypertRemoteService {
  static inject = []

  queue = Promise.resolve()

  /**
   * @param ctx - Host context carrying the optional plugin manager, config editor and Loader.
   */
  constructor(ctx) {
    super(ctx, 'pluginManagerController', { namespace: 'pluginManager' })
  }

  /**
   * Every mounted, non-group entry with the reason a browser may not switch it.
   */
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

  /**
   * @param request - the mounted entry id and the state to put it in.
   */
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
