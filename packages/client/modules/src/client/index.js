import { ClientModuleSystem } from './system.js'
import { parseBootManifest } from './manifest.js'

export { ClientModuleSystem }
export { parseBootManifest, stripClientSuffix } from './manifest.js'

let moduleSystem

export function createClientModuleSystem(options) {
  moduleSystem = new ClientModuleSystem({
    manifest: parseBootManifest(options.boot),
    staticModules: options.staticModules,
    ...(options.importModule === undefined ? {} : { importModule: options.importModule }),
  })
  return moduleSystem
}

export function apply(ctx) {
  if (moduleSystem === undefined) {
    throw new Error('client-modules: createClientModuleSystem must run before plugin boot')
  }
  ctx.reflect.provide('modules', moduleSystem)
}
