export class BaseEnvironment {
    constructor(opts = {}) { this.opts = opts; this.cwd = opts.cwd || '/workspace'; this.name = 'base' }
    async run(_cmd, _o) { throw new Error(this.name + '.run() not implemented') }
    async put(_l, _r) { throw new Error(this.name + '.put() not implemented') }
    async get(_r, _l) { throw new Error(this.name + '.get() not implemented') }
    async shutdown() {}
    async ready() { return true }
}

export async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs = 60000 } = {}) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
        const res = await fetch(url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal })
        const txt = await res.text()
        let json = null
        try { json = txt ? JSON.parse(txt) : null } catch { json = { raw: txt } }
        return { ok: res.ok, status: res.status, json, text: txt }
    } finally { clearTimeout(t) }
}

export function requireEnv(name) {
    const v = process.env[name]
    if (!v) throw new Error('missing env: ' + name)
    return v
}
