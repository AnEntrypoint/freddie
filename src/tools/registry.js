import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const _tools = new Map()
let _discovered = false

export const registry = {
    register(spec) {
        if (!spec?.name) throw new Error('tool name required')
        _tools.set(spec.name, {
            name: spec.name,
            toolset: spec.toolset || 'core',
            schema: spec.schema || { name: spec.name, description: '', parameters: { type: 'object', properties: {} } },
            handler: spec.handler,
            checkFn: spec.checkFn || (() => true),
            requiresEnv: spec.requiresEnv || [],
        })
    },
    list() { return [..._tools.values()] },
    get(name) { return _tools.get(name) },
    available() { return [..._tools.values()].filter(t => safeCheck(t)) },
    schemas(tools) {
        const src = tools || this.available()
        return src.map(t => t.schema)
    },
    async dispatch(name, args = {}, ctx = {}) {
        const t = _tools.get(name)
        if (!t) return JSON.stringify({ error: `unknown tool: ${name}` })
        if (!safeCheck(t)) return JSON.stringify({ error: `tool unavailable: ${name}`, requires: t.requiresEnv })
        try {
            const result = await t.handler(args, ctx)
            return typeof result === 'string' ? result : JSON.stringify(result)
        } catch (e) {
            return JSON.stringify({ error: String(e?.message || e), tool: name })
        }
    },
    clearForTests() { _tools.clear(); _discovered = false },
}

function safeCheck(t) {
    try { return t.checkFn(t) !== false } catch { return false }
}

export async function discoverBuiltinTools() {
    if (_discovered) return
    _discovered = true
    const here = path.dirname(fileURLToPath(import.meta.url))
    const entries = fs.readdirSync(here).filter(f => f.endsWith('.js') && f !== 'registry.js' && f !== 'index.js')
    for (const f of entries) {
        const url = new URL(`./${f}`, import.meta.url).href
        try { await import(url) } catch (e) { console.error(`tool load failed ${f}: ${e.message}`) }
    }
}
