import { BaseEnvironment, fetchJson, requireEnv } from './base.js'

export class VercelSandboxEnvironment extends BaseEnvironment {
    constructor(opts = {}) {
        super(opts)
        this.name = 'vercel_sandbox'
        this.apiUrl = opts.apiUrl || process.env.VERCEL_SANDBOX_URL || 'https://api.vercel.com/v1/sandbox'
        this.token = opts.token || process.env.VERCEL_TOKEN
        this.runtime = opts.runtime || 'node22'
        this.sandboxId = null
        this.cwd = opts.cwd || '/vercel/sandbox'
    }
    headers() { return { authorization: 'Bearer ' + (this.token || requireEnv('VERCEL_TOKEN')) } }
    async ensureSandbox() {
        if (this.sandboxId) return this.sandboxId
        const r = await fetchJson(this.apiUrl, { method: 'POST', headers: this.headers(), body: { runtime: this.runtime, timeout: this.opts.timeoutSec || 600 } })
        if (!r.ok) throw new Error('vercel sandbox create: ' + r.status + ' ' + r.text)
        this.sandboxId = r.json.id
        return this.sandboxId
    }
    async run(cmd, { timeoutMs = 120000 } = {}) {
        try {
            const id = await this.ensureSandbox()
            const r = await fetchJson(this.apiUrl + '/' + id + '/exec', { method: 'POST', headers: this.headers(), body: { cmd: ['sh', '-c', cmd], cwd: this.cwd }, timeoutMs })
            return { exitCode: r.json?.exitCode ?? (r.ok ? 0 : -1), stdout: r.json?.stdout || '', stderr: r.json?.stderr || (!r.ok ? r.text : '') }
        } catch (e) { return { exitCode: -1, stdout: '', stderr: e.message } }
    }
    async put(localPath, remotePath) {
        const fs = await import('node:fs')
        const id = await this.ensureSandbox()
        const r = await fetchJson(this.apiUrl + '/' + id + '/files', { method: 'PUT', headers: this.headers(), body: { path: remotePath, content: fs.readFileSync(localPath).toString('base64'), encoding: 'base64' } })
        return r.ok ? { copied: remotePath } : { error: r.text }
    }
    async get(remotePath, localPath) {
        const fs = await import('node:fs')
        const id = await this.ensureSandbox()
        const r = await fetchJson(this.apiUrl + '/' + id + '/files?path=' + encodeURIComponent(remotePath), { headers: this.headers() })
        if (!r.ok) return { error: r.text }
        fs.writeFileSync(localPath, Buffer.from(r.json?.content || '', 'base64'))
        return { copied: localPath }
    }
    async shutdown() {
        if (!this.sandboxId) return
        await fetchJson(this.apiUrl + '/' + this.sandboxId, { method: 'DELETE', headers: this.headers() })
        this.sandboxId = null
    }
}
