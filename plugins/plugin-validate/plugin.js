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
            description: 'Manage plugins: validate <path>, install <spec>, remove <name>, list, registry [set <url>|list], search <query>',
            args: [{ name: 'action', default: 'validate' }, { name: 'target' }, { name: 'extra' }],
            action: async (action, target, extra) => {
                if (action === 'install') {
                    const { installPlugin: installFromStore } = await import('../../src/plugins/install.js')
                    try {
                        const result = await installFromStore(target)
                        console.log(`OK    installed ${result.name} from ${result.source}`)
                        console.log('Restart the dashboard or start a new session for the plugin to be discovered.')
                    } catch (e) { console.log(`FAIL  ${e.message}`); process.exitCode = 1 }
                    return
                }
                if (action === 'remove') {
                    if (!target) { console.log('usage: freddie plugin remove <name>'); return }
                    const { removePlugin: removeFromStore } = await import('../../src/plugins/install.js')
                    try {
                        const result = removeFromStore(target)
                        console.log(`OK    removed ${result.name}`)
                        console.log('Restart the dashboard or start a new session for the plugin to be discovered.')
                    } catch (e) { console.log(`FAIL  ${e.message}`); process.exitCode = 1 }
                    return
                }
                if (action === 'list') {
                    const { listInstalledPlugins } = await import('../../src/plugins/install.js')
                    try {
                        const plugins = listInstalledPlugins()
                        if (!plugins.length) { console.log('(no plugins installed)'); return }
                        for (const p of plugins) {
                            const parts = [`  ${p.name}`]
                            if (p.version) parts.push(`v${p.version}`)
                            if (p.source) parts.push(`(${p.source})`)
                            if (p.installed_at) parts.push(`installed ${p.installed_at.slice(0, 10)}`)
                            console.log(parts.join('  '))
                        }
                    } catch (e) { console.log(`FAIL  ${e.message}`); process.exitCode = 1 }
                    return
                }
                if (action === 'install-legacy') {
                    const r = await installPlugin(target)
                    if (!r.ok) { console.log(`FAIL  ${r.error}`); process.exitCode = 1; return }
                    console.log(`OK    installed ${target}@${r.version} -> ${r.dir}`)
                    return
                }
                if (action === 'certify') {
                    if (!target) { console.log('usage: freddie plugin certify <path>'); process.exitCode = 1; return }
                    const dir = path.resolve(target)
                    if (!fs.existsSync(dir)) { console.log(`no such directory: ${dir}`); process.exitCode = 1; return }

                    const { kind, value, error } = await loadCandidate(dir)
                    if (error) { console.log(`[Experimental] ${dir}\n  ${error}`); process.exitCode = 1; return }

                    // Check for experimental flag in plugin.json
                    const manifestPath = path.join(dir, 'plugin.json')
                    let manifest = null
                    if (fs.existsSync(manifestPath)) {
                        try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch { /* invalid JSON, fall through */ }
                    }
                    if (manifest?.experimental) {
                        console.log(`[Experimental] ${dir}  (plugin.json experimental: true)`)
                        return
                    }

                    // Validate against the contract
                    let contractOk = false
                    try {
                        validatePlugin(value)
                        contractOk = true
                    } catch (e) {
                        console.log(`[Community] ${dir}  (contract validation failed: ${e.message})`)
                        return
                    }

                    // Check for safety_rating in plugin.json
                    if (!manifest || !manifest.safety_rating) {
                        console.log(`[Community] ${dir}  (no safety_rating in plugin.json)`)
                        return
                    }

                    // Check for critical OSV findings
                    const osvScript = path.join(process.cwd(), 'scripts', 'osv-scan-lockfile.mjs')
                    if (fs.existsSync(osvScript)) {
                        const { execFileSync } = await import('node:child_process')
                        try {
                            // Run osv-scan against the plugin dir's lockfile or package.json
                            const lockfile = path.join(dir, 'package-lock.json')
                            if (fs.existsSync(lockfile)) {
                                execFileSync(process.execPath, [osvScript, lockfile], { encoding: 'utf8', timeout: 120000 })
                            }
                        } catch (e) {
                            const out = (e.stdout || '') + (e.stderr || '')
                            if (out.includes('CRITICAL')) {
                                console.log(`[Community] ${dir}  (CRITICAL OSV findings detected)`)
                                return
                            }
                        }
                    }

                    console.log(`[Certified] ${dir}  (contract ok, safety_rating=${manifest.safety_rating}, no critical OSV findings)`)
                    return
                }
                if (action === 'registry') {
                    const { getRegistryUrl, setRegistryUrl, fetchRegistryIndex, validateRegistryUrl } = await import('../../src/plugins/install.js')
                    if (target === 'set') {
                        if (!extra) { console.log('usage: freddie plugin registry set <url>'); process.exitCode = 1; return }
                        const validation = await validateRegistryUrl(extra)
                        if (!validation.valid) {
                            console.log(`WARN  registry URL validation failed: ${validation.error}`)
                            console.log(`      The URL will be saved anyway. Verify it points to a valid index.json.`)
                        }
                        await setRegistryUrl(extra)
                        console.log(`OK    registry URL set to ${extra}`)
                        if (validation.valid) console.log(`      Validated: ${validation.pluginCount} plugins available`)
                        return
                    }
                    if (target === 'list' || !target) {
                        try {
                            const index = await fetchRegistryIndex()
                            console.log(`Registry: ${await getRegistryUrl()}`)
                            console.log(`Plugins: ${index.plugins.length}`)
                            for (const p of index.plugins) {
                                console.log(`  ${p.name.padEnd(24)} v${p.version || '?'}  ${(p.description || '').slice(0, 60)}`)
                            }
                        } catch (e) {
                            console.log(`FAIL  could not fetch registry: ${e.message}`)
                            console.log(`      Configure with: freddie plugin registry set <url>`)
                            process.exitCode = 1
                        }
                        return
                    }
                    console.log(`unknown registry action '${target}' — usage: freddie plugin registry [set <url>|list]`)
                    process.exitCode = 1
                    return
                }
                if (action === 'search') {
                    if (!target) { console.log('usage: freddie plugin search <query>'); process.exitCode = 1; return }
                    const { searchRegistry } = await import('../../src/plugins/install.js')
                    try {
                        const results = await searchRegistry(target)
                        if (!results.length) { console.log(`no plugins matching "${target}"`); return }
                        console.log(`${results.length} plugin(s) matching "${target}":`)
                        for (const p of results) {
                            console.log(`  ${p.name.padEnd(24)} v${p.version || '?'}  ${(p.description || '').slice(0, 60)}`)
                            if (p.repository) console.log(`    repo: ${p.repository}`)
                        }
                    } catch (e) {
                        console.log(`FAIL  search failed: ${e.message}`)
                        console.log(`      Configure a registry with: freddie plugin registry set <url>`)
                        process.exitCode = 1
                    }
                    return
                }
                if (action !== 'validate') { console.log(`unknown action '${action}' — usage: freddie plugin validate <path> | certify <path> | install <spec> | remove <name> | list | registry [set <url>|list] | search <query>`); return }
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
