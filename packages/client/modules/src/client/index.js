/**
 * Browser half (the standard `./client` export): the module-system class and
 * wire contract, plus the enrollment plugin face. The module system itself is
 * built by the shell kernel before cordis exists (the bootstrap exception —
 * the mechanism that loads plugins cannot arrive through itself): the host
 * page's `<script type="module">` boot entry imports this package directly
 * (a real static/dynamic ESM import — no registration queue is needed since
 * native `import()` already sequences module execution before the importer's
 * own code runs) and calls {@link createClientModuleSystem} with the parsed
 * boot graph before starting the plugin loader. The plugin face only enrolls
 * that pre-existing instance by providing it as `ctx.modules`.
 * @module @freddie/freddie-client-modules/client
 */
import { ClientModuleSystem } from './system.js'
import { parseBootManifest } from './manifest.js'

export { ClientModuleSystem }
export { parseBootManifest, stripClientSuffix } from './manifest.js'

let moduleSystem

/**
 * Build the live module system from the host page's boot graph.
 * @param options - Raw boot graph, platform seed, and optional dynamic-import replacement.
 * @returns The created module system, also published for this package's Cordis plugin face.
 */
export function createClientModuleSystem(options) {
  moduleSystem = new ClientModuleSystem({
    manifest: parseBootManifest(options.boot),
    staticModules: options.staticModules,
    ...(options.importModule === undefined ? {} : { importModule: options.importModule }),
  })
  return moduleSystem
}

/**
 * Enroll the kernel-built module system as `ctx.modules`.
 * @param ctx - client root context.
 */
export function apply(ctx) {
  if (moduleSystem === undefined) {
    throw new Error('client-modules: createClientModuleSystem must run before plugin boot')
  }
  ctx.reflect.provide('modules', moduleSystem)
}
