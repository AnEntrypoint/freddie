export class CopilotAcpClient {
    constructor({ url, token } = {}) { this.url = url || process.env.COPILOT_ACP_URL; this.token = token || process.env.COPILOT_TOKEN }
    headers() { return this.token ? { authorization: 'Bearer ' + this.token } : {} }
    async listModels() { if (!this.url) throw new Error('COPILOT_ACP_URL required'); return await (await fetch(this.url + '/models', { headers: this.headers() })).json() }
    async chat({ messages, model }) { if (!this.url) throw new Error('COPILOT_ACP_URL required'); return await (await fetch(this.url + '/chat', { method: 'POST', headers: { ...this.headers(), 'content-type': 'application/json' }, body: JSON.stringify({ messages, model }) })).json() }
}
