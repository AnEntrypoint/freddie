import { BaseEnvironment, fetchJson, requireEnv } from './base.js'

export class DaytonaEnvironment extends BaseEnvironment {
    constructor(opts = {}) {
        super(opts)
        this.name = 'daytona'
        this.apiUrl = opts.apiUrl || process.env.DAYTONA_API_URL || 'https://app.daytona.io/api'
        this.apiKey = opts.apiKey || process.env.DAYTONA_API_KEY
        this.target = opts.target || process.env.DAYTONA_TARGET || 'us'
        this.workspaceId = opts.workspaceId || null
        this.cwd = opts.cwd || '/workspace'
    }
    headers() { return { authorization: 'Bearer ' + (this.apiKey || requireEnv('DAYTONA_API_KEY')) } }
    async ensureWorkspace() {
        if (this.workspaceId) return this.workspaceId
        const r = await fetchJson(this.apiUrl + '/workspace', { method: 'POST', headers: this.headers(), body: { target: this.target, image: this.opts.image || 'ubuntu:22.04' } })
        if (!r.ok) throw new Error('daytona create: ' + r.status + ' ' + r.text)
        this.workspaceId = r.json.id
        return this.workspaceId
    }
    async run(cmd, { timeoutMs = 120000 } = {}) {
        try {
            const id = await this.ensureWorkspace()
            const r = await fetchJson(this.apiUrl + '/workspace/' + id + '/exec', { method: 'POST', headers: this.headers(), body: { command: cmd, cwd: this.cwd }, timeoutMs })
            return { exitCode: r.json?.exit_code ?? (r.ok ? 0 : -1), stdout: r.json?.stdout || '', stderr: r.json?.stderr || (!r.ok ? r.text : '') }
        } catch (e) { return { exitCode: -1, stdout: '', stderr: e.message } }
    }
    async put(localPath, remotePath) {
        const fs = await import('node:fs')
        const id = await this.ensureWorkspace()
        const buf = fs.readFileSync(localPath)
        const r = await fetchJson(this.apiUrl + '/workspace/' + id + '/files', { method: 'POST', headers: this.headers(), body: { path: remotePath, content: buf.toString('base64'), encoding: 'base64' } })
        return { copied: remotePath, ok: r.ok }
    }
    async get(remotePath, localPath) {
        const fs = await import('node:fs')
        const id = await this.ensureWorkspace()
        const r = await fetchJson(this.apiUrl + '/workspace/' + id + '/files?path=' + encodeURIComponent(remotePath), { headers: this.headers() })
        if (!r.ok) return { error: r.text }
        fs.writeFileSync(localPath, Buffer.from(r.json?.content || '', 'base64'))
        return { copied: localPath }
    }
    async shutdown() {
        if (!this.workspaceId) return
        await fetchJson(this.apiUrl + '/workspace/' + this.workspaceId, { method: 'DELETE', headers: this.headers() })
        this.workspaceId = null
    }
}
