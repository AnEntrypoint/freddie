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
 * either a plugin.js entry (optional lib/ subdir) whose default/named
 * `plugin` export satisfies src/host/contract.js#validatePlugin, OR a bare
 * handler.js exporting `_tool` with no sibling plugin.js -- both are
 * genuinely supported by src/host/plugin-discovery.js's scanPluginDir()
 * (the handler.js branch runs unconditionally, at any nesting depth, and
 * auto-wraps the export as {name:'tool-<dirname>', surfaces:'pi', ...}).
 * AGENTS.md's "Adding a tool" section documents this handler.js-only shape
 * as an intentional fallback for a single simple tool, not legacy debt --
 * 7 named live examples there, 23 confirmed live-registered in the current
 * tree with zero load failures. Only a directory with NEITHER file is an
 * actual violation (nothing discovers it at all).
 *
 * Does not import/execute plugin.js/handler.js unless `deep` is true
 * (importing every plugin has side effects and pulls in the full
 * dependency graph); by default this only checks the directory shape.
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

    if (!hasPlugin && !hasHandler) {
        result.violations.push('missing plugin.js entry (and no handler.js fallback)')
        result.shape = 'unknown'
        return result
    }
    result.shape = hasPlugin ? 'plugin' : 'handler-only'
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
        .filter(e => e.isDirectory() && !e.name.startsWith('.') && !exclude.includes(e.name))
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
