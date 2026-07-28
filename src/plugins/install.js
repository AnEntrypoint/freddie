import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { getFreddieHome } from '../home.js'

const isBrowser = typeof window !== 'undefined'

// ---------------------------------------------------------------------------
// Browser guard
// ---------------------------------------------------------------------------
function assertNotBrowser() {
    if (isBrowser) throw new Error('Plugin installation is not available in the browser. Use the desktop CLI.')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pluginDir(freddieHome) {
    const home = freddieHome || getFreddieHome()
    return path.join(home, 'plugins')
}

function installedAtPath(dir) {
    const meta = path.join(dir, 'plugin.json')
    try {
        const raw = JSON.parse(fs.readFileSync(meta, 'utf8'))
        return raw.installed_at || null
    } catch { return null }
}

function resolveName(dir) {
    // Try to read name from plugin.js's default export
    try {
        const src = fs.readFileSync(path.join(dir, 'plugin.js'), 'utf8')
        const m = src.match(/(?:export\s+default\s*\{|name\s*:\s*)['"](\S+?)['"]/)
        if (m) return m[1]
    } catch { /* fall through */ }
    // Fall back to directory name
    return path.basename(dir)
}

function readPluginVersion(dir) {
    const meta = path.join(dir, 'plugin.json')
    try {
        const raw = JSON.parse(fs.readFileSync(meta, 'utf8'))
        return raw.version || null
    } catch { return null }
}

// ---------------------------------------------------------------------------
// installPlugin(spec, {freddieHome})
//   spec variants:
//     - npm package:  "npm:<package>[@version]"  e.g. "npm:@scope/name"
//     - git repo:     "git:<url>"                e.g. "git:https://github.com/user/repo.git"
//     - local path:   "<path>"                   e.g. "./my-plugin" or "/abs/path"
// ---------------------------------------------------------------------------
export async function installPlugin(spec, { freddieHome } = {}) {
    assertNotBrowser()
    const home = freddieHome || getFreddieHome()
    const root = pluginDir(home)
    fs.mkdirSync(root, { recursive: true })

    let source, name

    if (spec.startsWith('npm:')) {
        const pkg = spec.slice(4).trim()
        if (!pkg) throw new Error('npm specifier must be in the form "npm:<package>[@version]"')
        const tmpDir = path.join(root, '.tmp-' + Date.now())
        fs.mkdirSync(tmpDir, { recursive: true })
        try {
            execSync(`npm install "${pkg}" --prefix "${tmpDir}" --no-save --silent`, { stdio: 'pipe', timeout: 120_000 })
            // Find the installed package directory under node_modules
            const nm = path.join(tmpDir, 'node_modules')
            const dirs = fs.readdirSync(nm, { withFileTypes: true })
            // Skip scoped packages (@scope) — look one level deeper
            let pkgDir = null
            for (const d of dirs) {
                if (d.name.startsWith('@')) {
                    const scoped = path.join(nm, d.name)
                    if (fs.statSync(scoped).isDirectory()) {
                        const inner = fs.readdirSync(scoped, { withFileTypes: true })
                        for (const id of inner) {
                            if (id.isDirectory()) { pkgDir = path.join(scoped, id.name); break }
                        }
                        if (pkgDir) break
                    }
                } else if (d.isDirectory()) {
                    pkgDir = path.join(nm, d.name)
                    break
                }
            }
            if (!pkgDir || !fs.existsSync(path.join(pkgDir, 'plugin.js')))
                throw new Error(`npm package "${pkg}" does not contain a plugin.js at its root`)
            name = resolveName(pkgDir)
            const dest = path.join(root, name)
            if (fs.existsSync(dest)) throw new Error(`plugin "${name}" is already installed`)
            fs.cpSync(pkgDir, dest, { recursive: true })
            source = 'npm:' + pkg
        } finally {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* best-effort */ }
        }
    } else if (spec.startsWith('git:')) {
        const url = spec.slice(4).trim()
        if (!url) throw new Error('git specifier must be in the form "git:<url>"')
        const tmpDir = path.join(root, '.tmp-' + Date.now())
        try {
            execSync(`git clone "${url}" "${tmpDir}"`, { stdio: 'pipe', timeout: 120_000 })
            if (!fs.existsSync(path.join(tmpDir, 'plugin.js')))
                throw new Error(`cloned repo does not contain a plugin.js at its root`)
            name = resolveName(tmpDir)
            const dest = path.join(root, name)
            if (fs.existsSync(dest)) throw new Error(`plugin "${name}" is already installed`)
            fs.cpSync(tmpDir, dest, { recursive: true })
            // Remove .git dir
            try { fs.rmSync(path.join(dest, '.git'), { recursive: true, force: true }) } catch { /* ok */ }
            source = 'git:' + url
        } finally {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* best-effort */ }
        }
    } else {
        // Local path
        const abs = path.resolve(spec)
        if (!fs.existsSync(abs)) throw new Error(`path not found: ${abs}`)
        if (!fs.statSync(abs).isDirectory()) throw new Error(`path is not a directory: ${abs}`)
        if (!fs.existsSync(path.join(abs, 'plugin.js')) && !fs.existsSync(path.join(abs, 'handler.js')))
            throw new Error(`directory does not contain a plugin.js or handler.js: ${abs}`)
        name = resolveName(abs)
        const dest = path.join(root, name)
        if (fs.existsSync(dest)) throw new Error(`plugin "${name}" is already installed at ${dest}`)
        fs.cpSync(abs, dest, { recursive: true })
        source = abs
    }

    // Record metadata
    const meta = path.join(root, name, 'plugin.json')
    let metaObj = {}
    try { metaObj = JSON.parse(fs.readFileSync(meta, 'utf8')) } catch { /* ok */ }
    metaObj.installed_at = new Date().toISOString()
    metaObj.installed_source = source
    if (!metaObj.version) metaObj.version = readPluginVersion(path.join(root, name))
    fs.writeFileSync(meta, JSON.stringify(metaObj, null, 2) + '\n')

    return { name, source, installed_at: metaObj.installed_at }
}

// ---------------------------------------------------------------------------
// removePlugin(name, {freddieHome})
// ---------------------------------------------------------------------------
export function removePlugin(name, { freddieHome } = {}) {
    assertNotBrowser()
    const home = freddieHome || getFreddieHome()
    const root = pluginDir(home)
    const dir = path.join(root, name)
    if (!fs.existsSync(dir)) throw new Error(`plugin "${name}" is not installed`)
    if (!fs.statSync(dir).isDirectory()) throw new Error(`"${name}" is not a directory`)
    // Safety: only remove if it contains plugin.js or handler.js
    const hasPlugin = fs.existsSync(path.join(dir, 'plugin.js')) || fs.existsSync(path.join(dir, 'handler.js'))
    if (!hasPlugin) throw new Error(`"${name}" does not appear to be a plugin directory`)
    fs.rmSync(dir, { recursive: true, force: true })
    return { name, removed: true }
}

// ---------------------------------------------------------------------------
// listInstalledPlugins({freddieHome})
// ---------------------------------------------------------------------------
export function listInstalledPlugins({ freddieHome } = {}) {
    const home = freddieHome || getFreddieHome()
    const root = pluginDir(home)
    if (!fs.existsSync(root)) return []
    const result = []
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.tmp-')) continue
        const dir = path.join(root, entry.name)
        const hasPlugin = fs.existsSync(path.join(dir, 'plugin.js')) || fs.existsSync(path.join(dir, 'handler.js'))
        if (!hasPlugin) continue
        result.push({
            name: entry.name,
            version: readPluginVersion(dir) || null,
            source: (() => {
                const meta = path.join(dir, 'plugin.json')
                try {
                    const raw = JSON.parse(fs.readFileSync(meta, 'utf8'))
                    return raw.installed_source || null
                } catch { return null }
            })(),
            installed_at: installedAtPath(dir),
        })
    }
    return result
}

// ---------------------------------------------------------------------------
// Plugin registry — fetch, search, configure a remote plugin index
// ---------------------------------------------------------------------------

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/AnEntrypoint/freddie-plugin-registry/main/index.json'

/**
 * Get the configured registry URL, falling back to the default.
 * @returns {Promise<string>}
 */
export async function getRegistryUrl() {
    try {
        const { getConfigValue } = await import('../config.js')
        return getConfigValue('plugins.registry_url', DEFAULT_REGISTRY_URL)
    } catch { return DEFAULT_REGISTRY_URL }
}

/**
 * Set the registry URL in config.
 * @param {string} url
 * @param {Object} [opts]
 * @param {string} [opts.freddieHome]
 */
export async function setRegistryUrl(url, { freddieHome } = {}) {
    assertNotBrowser()
    const { saveConfigValue } = await import('../config.js')
    if (freddieHome) {
        const { applyHomeOverride } = await import('../home.js')
        applyHomeOverride(freddieHome)
    }
    saveConfigValue('plugins.registry_url', url)
}

/**
 * Fetch the registry index from a URL.
 * @param {string} [url] — defaults to getRegistryUrl()
 * @returns {Promise<{plugins: Array<{name: string, version: string, description: string, repository: string, install_count: number}>}>}
 */
export async function fetchRegistryIndex(url) {
    const registryUrl = url || await getRegistryUrl()
    let body
    if (isBrowser) {
        const res = await fetch(registryUrl)
        if (!res.ok) throw new Error(`registry fetch failed: ${res.status} ${res.statusText}`)
        body = await res.text()
    } else {
        // Node: use global fetch (Node 18+)
        const res = await globalThis.fetch(registryUrl)
        if (!res.ok) throw new Error(`registry fetch failed: ${res.status} ${res.statusText}`)
        body = await res.text()
    }
    const parsed = JSON.parse(body)
    if (!parsed || !Array.isArray(parsed.plugins)) {
        throw new Error('invalid registry index: expected {plugins: [...]}')
    }
    return parsed
}

/**
 * Search the registry for plugins matching a query.
 * @param {string} query
 * @param {Object} [opts]
 * @param {string} [opts.url] — registry URL
 * @returns {Promise<Array<{name: string, version: string, description: string, repository: string, install_count: number}>>}
 */
export async function searchRegistry(query, { url } = {}) {
    const index = await fetchRegistryIndex(url)
    const q = query.toLowerCase()
    return index.plugins.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
    )
}

/**
 * Validate that a URL points to a valid registry index.json.
 * @param {string} url
 * @returns {Promise<{valid: boolean, pluginCount?: number, error?: string}>}
 */
export async function validateRegistryUrl(url) {
    try {
        const index = await fetchRegistryIndex(url)
        return { valid: true, pluginCount: index.plugins.length }
    } catch (e) {
        return { valid: false, error: e.message }
    }
}