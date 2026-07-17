// Filesystem-backed memory provider: dumps each turn as a JSON file under the
// freddie home dir and does a naive substring scan over the last 20 files on
// prefetch. Genuinely divergent from the REST-backed providers (no network
// call, no auth, no field-name mapping) so it keeps its own class rather than
// going through generic-rest-memory.js's createMemoryProvider() factory.
import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../../../../src/plugins/../home.js'

export class HolographicMemory {
    constructor(opts = {}) {
        this.name = 'holographic'
        this.dir = opts.dir || path.join(getFreddieHome(), 'memory', 'holographic')
        fs.mkdirSync(this.dir, { recursive: true })
    }
    getRequiredEnv() { return [] }
    async syncTurn(messages) {
        const file = path.join(this.dir, Date.now() + '.json')
        fs.writeFileSync(file, JSON.stringify({ ts: Date.now(), messages }), 'utf8')
        return { stored: file }
    }
    async prefetch(query) {
        const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json')).sort().slice(-20)
        const items = []
        for (const f of files) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'))
                const last = data.messages?.slice(-2).map(m => m.content).join(' ') || ''
                if (!query || last.toLowerCase().includes(String(query).toLowerCase())) items.push({ file: f, summary: last.slice(0, 200) })
            } catch {}
        }
        return { items }
    }
    async shutdown() {}
    async postSetup() {}
}
