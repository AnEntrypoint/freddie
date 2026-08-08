// ---------------------------------------------------------------------------
// Plugin registry — fetch, search, configure a remote plugin index
// ---------------------------------------------------------------------------

const isBrowser = typeof window !== 'undefined'

function assertNotBrowser() {
    if (isBrowser) throw new Error('Plugin installation is not available in the browser. Use the desktop CLI.')
}

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
