// `freddie plugin validate <path>` — load a single plugin.js/handler.js file
// and check it against the real contract (src/host/contract.js validatePlugin)
// without a full host boot. Standalone pre-flight for plugin authors.
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { validatePlugin } from '../../src/host/contract.js'
import { validatePluginManifest } from '../../src/host/host_helpers.js'

async function loadCandidate(dir) {
    const pluginFile = path.join(dir, 'plugin.js')
    if (fs.existsSync(pluginFile)) {
        const mod = await import(pathToFileURL(pluginFile).href)
        return { kind: 'plugin.js', value: mod.default || mod.plugin }
    }
    const handlerFile = path.join(dir, 'handler.js')
    if (fs.existsSync(handlerFile)) {
        const mod = await import(pathToFileURL(handlerFile).href)
        const tools = Object.values(mod).filter(v => v && typeof v === 'object' && v.name && v.schema && typeof v.handler === 'function')
        if (tools.length) return { kind: 'handler.js', value: { name: `tool-${path.basename(dir)}`, surfaces: 'pi', register() {}, _tools: tools } }
        return { kind: 'handler.js', value: null, error: 'handler.js exports no recognizable tool shape ({name,schema,handler})' }
    }
    return { kind: null, value: null, error: 'neither plugin.js nor handler.js found in ' + dir }
}

export default {
    name: 'plugin-validate', surfaces: 'pi',
    register({ pi }) {
        pi.cli.register({
            name: 'plugin',
            description: 'Validate a plugin directory against the real host contract (validate <path>)',
            args: [{ name: 'action', default: 'validate' }, { name: 'path' }],
            action: async (action, target) => {
                if (action !== 'validate') { console.log(`unknown action '${action}' — usage: freddie plugin validate <path>`); return }
                if (!target) { console.log('usage: freddie plugin validate <path>'); return }
                const dir = path.resolve(target)
                if (!fs.existsSync(dir)) { console.log(`no such directory: ${dir}`); process.exitCode = 1; return }
                const { kind, value, error } = await loadCandidate(dir)
                if (error) { console.log(`FAIL  ${dir}\n  ${error}`); process.exitCode = 1; return }
                try {
                    validatePlugin(value)
                    console.log(`OK    ${dir}  (${kind}, surfaces=${value.surfaces}${value._tools ? `, tools=${value._tools.map(t => t.name).join(',')}` : ''})`)
                } catch (e) {
                    console.log(`FAIL  ${dir}\n  ${e.message}`)
                    process.exitCode = 1
                    return
                }
                const manifestPath = path.join(dir, 'plugin.json')
                if (fs.existsSync(manifestPath)) {
                    let manifest
                    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) }
                    catch (e) { console.log(`FAIL  ${manifestPath}\n  invalid JSON: ${e.message}`); process.exitCode = 1; return }
                    const { valid, errors } = validatePluginManifest(manifest)
                    if (valid) console.log(`OK    ${manifestPath}  (manifest)`)
                    else { console.log(`FAIL  ${manifestPath}\n  ${errors.join('\n  ')}`); process.exitCode = 1 }
                }
            },
        })
    },
}
