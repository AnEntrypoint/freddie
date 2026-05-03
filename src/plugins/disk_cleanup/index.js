import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../../home.js'

const MAX_AGE_DAYS = { logs: 30, batches: 14, 'tool-results': 7, checkpoints: 90 }
export function cleanup({ now = Date.now() } = {}) {
    const removed = []
    for (const [sub, days] of Object.entries(MAX_AGE_DAYS)) {
        const dir = path.join(getFreddieHome(), sub)
        if (!fs.existsSync(dir)) continue
        const cutoff = now - days * 86400_000
        for (const f of fs.readdirSync(dir)) {
            const p = path.join(dir, f)
            try { if (fs.statSync(p).mtimeMs < cutoff) { fs.rmSync(p, { recursive: true, force: true }); removed.push(p) } } catch {}
        }
    }
    return { removed: removed.length }
}
export const plugin = {
    name: 'disk-cleanup',
    register: (ctx) => { ctx.registerHook('onSessionEnd', async (p) => { cleanup(); return p }) },
}
