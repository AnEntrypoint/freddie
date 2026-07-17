import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkAllPlugins, checkPluginDirAsync, summarize } from './lib/validate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// This plugin itself lives at plugins/debug/plugin-validate/ (post-f22
// category reorg), so plugins/ is two levels up, not one.
const PLUGINS_ROOT = path.join(__dirname, '..', '..')

// A bare plugin dir name (e.g. "core-cli") no longer sits directly under
// plugins/ post-f22-reorg — it's one category folder deeper. Accept either
// a bare name (searched across every category) or an explicit
// "category/name" path.
function resolveTargetDir(target) {
    const direct = path.join(PLUGINS_ROOT, target)
    if (fs.existsSync(direct)) return direct
    for (const cat of fs.readdirSync(PLUGINS_ROOT, { withFileTypes: true })) {
        if (!cat.isDirectory()) continue
        const candidate = path.join(PLUGINS_ROOT, cat.name, target)
        if (fs.existsSync(candidate)) return candidate
    }
    return direct
}

export default {
    // Distinct plugin identity from plugins/plugin-validate/ (origin's
    // single-file "freddie plugin validate <path>"/"freddie plugin install
    // <name>" tool) -- this is the bulk directory-scan checker against
    // src/host/plugin-manifest-schema.json, registered as its own CLI verb
    // (freddie plugin-validate) so both tools coexist without a name clash.
    name: 'plugin-validate-bulk',
    surfaces: 'pi',
    register({ pi }) {
        pi.cli.register({
            name: 'plugin-validate',
            description: 'Validate plugins/*/ directories against src/host/plugin-manifest-schema.json (plugin.js entry required, handler.js-only is a violation)',
            args: [
                { name: 'target', description: 'single plugin dir name to check, or omit to check all' },
                { name: 'deep', description: 'pass "deep" to also import plugin.js and run it through validatePlugin()' },
            ],
            action: async (target, deep) => {
                const wantDeep = target === 'deep' || deep === 'deep'
                const singleTarget = target && target !== 'deep' ? target : null

                if (singleTarget) {
                    const result = await checkPluginDirAsync(resolveTargetDir(singleTarget), { deep: wantDeep })
                    console.log(JSON.stringify(result, null, 2))
                    if (result.violations.length) process.exitCode = 1
                    return
                }

                const results = await checkAllPlugins(PLUGINS_ROOT, { deep: wantDeep })
                const summary = summarize(results)
                console.log(`plugin-validate: ${summary.ok}/${summary.total} ok, ${summary.violating} violating`)
                for (const v of summary.violations) console.log(`  ${v.shape.padEnd(14)} ${v.name}\t${v.reasons.join('; ')}`)
                if (summary.violating) process.exitCode = 1
            },
        })
    },
}
