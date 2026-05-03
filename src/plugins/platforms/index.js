import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function loadAllGatewayPlatforms() {
    const dir = path.resolve(__dirname, '../../gateway/platforms')
    const out = []
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
        const mod = await import('file://' + path.join(dir, f).replace(/\\/g, '/'))
        const cls = Object.values(mod).find(v => typeof v === 'function' && /Adapter$/.test(v.name))
        if (cls) out.push({ name: f.replace(/\.js$/, ''), cls })
    }
    return out
}
export const plugin = {
    name: 'platforms',
    register: () => {},
}
