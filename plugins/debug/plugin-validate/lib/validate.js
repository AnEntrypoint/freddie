import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validatePlugin } from '../../../../src/host/contract.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const SCHEMA_PATH = path.join(__dirname, '..', '..', '..', 'src', 'host', 'plugin-manifest-schema.json')

export function loadSchema() {
    return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'))
}

/**
 * Check a single plugins/<name>/ directory against the canonical shape:
 * required plugin.js entry (optional lib/ subdir), whose default/named
 * `plugin` export satisfies src/host/contract.js#validatePlugin.
 *
 * Does not import/execute plugin.js unless `deep` is true (importing every
 * plugin has side effects and pulls in the full dependency graph); by
 * default this only checks the directory shape, which is what the
 * F1-F20 handler.js-only violation actually is.
 */
export function checkPluginDir(dir, { deep = false } = {}) {
    const name = path.basename(dir)
    const pluginFile = path.join(dir, 'plugin.js')
    const handlerFile = path.join(dir, 'handler.js')
    const hasPlugin = fs.existsSync(pluginFile)
    const hasHandler = fs.existsSync(handlerFile)
    const libDir = path.join(dir, 'lib')
    const hasLib = fs.existsSync(libDir) && fs.statSync(libDir).isDirectory()

    const result = { name, dir, hasPlugin, hasHandler, hasLib, violations: [] }

    if (!hasPlugin) {
        result.violations.push(
            hasHandler
                ? `handler.js-only: missing plugin.js entry (has handler.js, picked up only via the discoverPlugins() legacy fallback in src/host/host.js)`
                : `missing plugin.js entry`
        )
        result.shape = hasHandler ? 'handler-only' : 'unknown'
        return result
    }
    result.shape = 'plugin'
    return result
}

// Dynamic import() is inherently async, so the "deep" mode (actually
// importing plugin.js and running it through validatePlugin()) lives in
// this async wrapper; checkPluginDir() above stays sync for the common
// (directory-shape-only) case used by the walk below.
export async function checkPluginDirAsync(dir, { deep = false } = {}) {
    const result = checkPluginDir(dir, { deep: false })
    if (deep && result.shape === 'plugin') {
        const pluginFile = path.join(dir, 'plugin.js')
        try {
            const mod = await import(pathToFileURL(pluginFile).href)
            const p = mod.default || mod.plugin
            if (!p) {
                result.violations.push('plugin.js has no default or named `plugin` export')
            } else {
                try {
                    validatePlugin(p)
                } catch (e) {
                    result.violations.push(`contract violation: ${e.message}`)
                }
            }
        } catch (e) {
            result.violations.push(`plugin.js failed to import: ${e.message}`)
        }
    }
    return result
}

/**
 * Walk pluginsRoot (default: repo plugins/) and check every plugin
 * directory. Since the f22 reorg, plugins live one level deeper under a
 * category folder (plugins/{core,gui,platform,memory,tools,security,debug}/)
 * so an entry with neither plugin.js nor handler.js of its own is treated as
 * a category and its children are checked instead — mirroring
 * discoverPlugins()'s own category-aware walk in src/host/host.js.
 * `_shared` (a shared-lib folder, not itself a plugin) and this
 * plugin-validate directory's own `lib/` are not plugin dirs and are
 * skipped by virtue of not looking like one — callers can also pass
 * `exclude` to skip known non-plugin dirs by name.
 */
export async function checkAllPlugins(pluginsRoot, { deep = false, exclude = ['_shared'] } = {}) {
    const entries = fs.readdirSync(pluginsRoot, { withFileTypes: true })
        .filter(e => e.isDirectory() && !exclude.includes(e.name))
    const results = []
    for (const e of entries) {
        const dir = path.join(pluginsRoot, e.name)
        const isPluginDir = fs.existsSync(path.join(dir, 'plugin.js')) || fs.existsSync(path.join(dir, 'handler.js'))
        if (!isPluginDir) {
            const children = fs.readdirSync(dir, { withFileTypes: true }).filter(c => c.isDirectory())
            for (const c of children) {
                const cdir = path.join(dir, c.name)
                results.push(deep ? await checkPluginDirAsync(cdir, { deep }) : checkPluginDir(cdir, { deep: false }))
            }
            continue
        }
        results.push(deep ? await checkPluginDirAsync(dir, { deep }) : checkPluginDir(dir, { deep: false }))
    }
    return results
}

export function summarize(results) {
    const violating = results.filter(r => r.violations.length > 0)
    return {
        total: results.length,
        ok: results.length - violating.length,
        violating: violating.length,
        violations: violating.map(r => ({ name: r.name, shape: r.shape, reasons: r.violations })),
    }
}
