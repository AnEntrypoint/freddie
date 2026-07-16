// `freddie plugin validate <path>` — load a single plugin.js/handler.js file
// and check it against the real contract (src/host/contract.js validatePlugin)
// without a full host boot. Standalone pre-flight for plugin authors.
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { validatePlugin } from '../../src/host/contract.js'
import { validatePluginManifest } from '../../src/host/host_helpers.js'
import { getConfigValue } from '../../src/config.js'
import { getFreddieHome } from '../../src/home.js'

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

// 'freddie plugin install <name>' -- fetches a plugin.json manifest + source
// from a configurable registry URL. No freddie-owned registry exists yet:
// the config key defaults unset and install fails with a clear message
// rather than silently no-opping or fabricating a fake default host. Real
// registry backend (static-index or hosted) is a distinct, much larger row
// (plugin-registry-backend-design) -- this is the CLI mechanics only, honest
// about there being nothing to fetch from until a registry_url is configured.
//
// Expected registry shape (matches plugin-marketplace-manifest's schema):
// GET <registryUrl>/<name>/plugin.json  -> the manifest (validated via
//   validatePluginManifest)
// GET <registryUrl>/<name>/plugin.js    -> the plugin source (written as-is)
async function installPlugin(name) {
    if (!name) return { ok: false, error: 'usage: freddie plugin install <name>' }
    const registryUrl = getConfigValue('plugin.registry_url', null)
    if (!registryUrl) return { ok: false, error: 'no plugin registry configured -- set plugin.registry_url in ~/.freddie/config.yaml (no freddie-owned registry exists yet)' }
    const base = registryUrl.replace(/\/$/, '')
    const manifestUrl = `${base}/${name}/plugin.json`
    const sourceUrl = `${base}/${name}/plugin.js`

    let manifestRes
    try { manifestRes = await fetch(manifestUrl) }
    catch (e) { return { ok: false, error: `failed to reach registry at ${manifestUrl}: ${e.message}` } }
    if (!manifestRes.ok) return { ok: false, error: `registry returned ${manifestRes.status} for ${manifestUrl}` }
    let manifest
    try { manifest = await manifestRes.json() }
    catch (e) { return { ok: false, error: `manifest at ${manifestUrl} is not valid JSON: ${e.message}` } }

    const { valid, errors } = validatePluginManifest(manifest)
    if (!valid) return { ok: false, error: `manifest validation failed:\n  ${errors.join('\n  ')}` }
    if (manifest.name !== name) return { ok: false, error: `manifest name '${manifest.name}' does not match requested '${name}'` }

    let sourceRes
    try { sourceRes = await fetch(sourceUrl) }
    catch (e) { return { ok: false, error: `failed to reach registry at ${sourceUrl}: ${e.message}` } }
    if (!sourceRes.ok) return { ok: false, error: `registry returned ${sourceRes.status} for ${sourceUrl}` }
    const source = await sourceRes.text()

    const destDir = path.join(getFreddieHome(), 'plugins', name)
    fs.mkdirSync(destDir, { recursive: true })
    fs.writeFileSync(path.join(destDir, 'plugin.js'), source)
    fs.writeFileSync(path.join(destDir, 'plugin.json'), JSON.stringify(manifest, null, 2))
    return { ok: true, dir: destDir, version: manifest.version }
}

export default {
    name: 'plugin-validate', surfaces: 'pi',
    register({ pi }) {
        pi.cli.register({
            name: 'plugin',
            description: 'Validate a plugin directory against the real host contract (validate <path>), or install one from a configured registry (install <name>)',
            args: [{ name: 'action', default: 'validate' }, { name: 'path' }],
            action: async (action, target) => {
                if (action === 'install') {
                    const r = await installPlugin(target)
                    if (!r.ok) { console.log(`FAIL  ${r.error}`); process.exitCode = 1; return }
                    console.log(`OK    installed ${target}@${r.version} -> ${r.dir}`)
                    return
                }
                if (action !== 'validate') { console.log(`unknown action '${action}' — usage: freddie plugin validate <path> | freddie plugin install <name>`); return }
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
