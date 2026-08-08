import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readManifestResources } from './tool-resources.js'
import { isFlagEnabled } from '../flags.js'

// A plugin.json's optional feature_flag field gates the plugin's own
// registration behind src/flags.js -- disabled means the plugin is skipped
// entirely at discovery time (kill switch), never even reaching register().
// Requires no other manifest fields; a missing plugin.json is the common case
// and simply means no flag gate applies.
function isFlagDisabled(dir) {
    const manifestPath = path.join(dir, 'plugin.json')
    if (!fs.existsSync(manifestPath)) return false
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        if (!manifest.feature_flag) return false
        return !isFlagEnabled(manifest.feature_flag)
    } catch { return false }
}

export async function discoverPlugins(roots) {
    const found = []
    for (const root of roots) {
        await scanPluginDir(root, found, 1)
    }
    return found
}

// A directory under a root is either a plugin dir (has plugin.js or the
// legacy handler.js) or, if it has neither, a pure category folder (e.g.
// plugins/gui/, plugins/platform/ per the f22 reorg) whose own children are
// the plugin dirs. `depth` caps the recursion at one category level deep so
// a root never turns into an unbounded filesystem walk. A plugin.json's
// feature_flag gate (isFlagDisabled) applies at every level -- a category
// folder itself is never flag-gated (it isn't a plugin), only its leaf
// plugin dirs are.
async function scanPluginDir(root, found, depth) {
    if (!root || !fs.existsSync(root)) return
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const dir = path.join(root, entry.name)
        const file = path.join(dir, 'plugin.js')
        if (fs.existsSync(file)) {
            if (isFlagDisabled(dir)) continue
            const declaredResources = readManifestResources(dir)
            const mod = await import(pathToFileURL(file).href)
            const p = mod.default || mod.plugin
            if (p) { p.__sourceFile = file; p.__resources = declaredResources; found.push(p) }
            continue
        }
        const handlerFile = path.join(dir, 'handler.js')
        if (fs.existsSync(handlerFile)) {
            if (isFlagDisabled(dir)) continue
            const declaredResources = readManifestResources(dir)
            const handlerMod = await import(pathToFileURL(handlerFile).href)
            const _tool = handlerMod._tool
            if (!_tool) continue
            found.push({
                name: `tool-${entry.name}`,
                surfaces: 'pi',
                __sourceFile: handlerFile,
                __resources: declaredResources,
                register({ pi }) { pi.tools.register(_tool) },
            })
            continue
        }
        if (depth > 0) await scanPluginDir(dir, found, depth - 1)
    }
}
