export class AtroposClient {
    constructor(opts = {}) {
        this.url = opts.url || process.env.ATROPOS_URL
        this.token = opts.token || process.env.ATROPOS_TOKEN
        this.platform = 'atropos'
    }
    getRequiredEnv() { return ['ATROPOS_URL', 'ATROPOS_TOKEN'] }
    async start() {
        if (!this.url) throw new Error('AtroposClient: ATROPOS_URL required')
        const r = await fetch(`${this.url}/health`, { headers: this._headers() })
        if (!r.ok) throw new Error('atropos health failed: ' + r.status)
    }
    _headers() { return this.token ? { authorization: `Bearer ${this.token}` } : {} }
    async listRollouts() {
        const r = await fetch(`${this.url}/rollouts`, { headers: this._headers() })
        if (!r.ok) return []
        return await r.json()
    }
    async submitTrajectory(traj) {
        return fetch(`${this.url}/trajectories`, { method: 'POST', headers: { ...this._headers(), 'content-type': 'application/json' }, body: JSON.stringify(traj) }).then(r => r.json())
    }
}
