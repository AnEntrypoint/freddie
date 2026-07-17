// Shared implementation for the simple REST-backed memory providers.
// Each memory-<provider> plugin's handler.js is a thin wrapper that calls
// createMemoryProvider() with its own name/env/base config and re-exports
// the resulting class. The class name matters: src/agent/memory_provider.js
// finds the provider class in a handler module by matching /Memory$/ on the
// exported function's .name, so the factory stamps the class name to
// `${ClassName}Memory` (e.g. ByteroverMemory) to keep that contract intact.

import { env } from '../../src/env.js'

/**
 * @param {object} config
 * @param {string} config.name        provider name (e.g. 'byterover')
 * @param {string} config.className   exported class name (e.g. 'ByteroverMemory')
 * @param {string} config.base        default API base URL
 * @param {string} config.envKey      env var name holding the API key (e.g. 'BYTEROVER_API_KEY')
 */
export function createMemoryProvider({ name, className, base, envKey }) {
    const errLabel = className || name

    const cls = class {
        constructor(opts = {}) {
            this.name = name
            this.apiKey = opts.apiKey || env(envKey)
            this.base = opts.base || base
            this.userId = opts.userId || 'default'
        }
        getRequiredEnv() { return [envKey] }
        _headers() {
            if (!this.apiKey) throw new Error(`${errLabel}: ${envKey} required`)
            return { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' }
        }
        async syncTurn(messages) {
            const res = await fetch(`${this.base}/memories`, { method: 'POST', headers: this._headers(), body: JSON.stringify({ user_id: this.userId, messages }) })
            return { status: res.status, ok: res.ok }
        }
        async prefetch(query) {
            const url = `${this.base}/memories/search?query=${encodeURIComponent(query || '')}&user_id=${encodeURIComponent(this.userId)}`
            const res = await fetch(url, { headers: this._headers() })
            if (!res.ok) return { items: [], status: res.status }
            return { items: await res.json() }
        }
        async shutdown() {}
        async postSetup() {}
    }

    Object.defineProperty(cls, 'name', { value: className || `${name}Memory`, configurable: true })
    return cls
}
