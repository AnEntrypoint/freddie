// Thin re-export barrel -- kept at this path so every existing importer
// (src/host/host.js, plugins/plugin-validate/plugin.js) continues to resolve
// without a path change. Real implementations live in the split-out modules:
// plugin-manifest.js (manifest validation) and surface-factories.js (pi/gui
// surface-maker factories + registration helpers).
export { validatePluginManifest, loadPluginManifestSchema } from './plugin-manifest.js'
export { reg, makePi, makeGui, guard, scopedCfg, nullStore, makeCcHooks, makeHooksRegistry, makeCcLoaders } from './surface-factories.js'
