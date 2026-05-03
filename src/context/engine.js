import fs from 'node:fs'
import path from 'node:path'
import { listSkills } from '../skills/index.js'

export const ContextPlugins = {
    file: async ({ cwd = process.cwd() } = {}) => {
        const candidates = ['.freddie-context', 'CLAUDE.md', 'AGENTS.md']
        const blocks = []
        for (const c of candidates) {
            const p = path.join(cwd, c)
            if (fs.existsSync(p)) blocks.push({ name: 'file:' + c, body: fs.readFileSync(p, 'utf8') })
        }
        return blocks
    },
    skills: async () => {
        return listSkills().map(s => ({ name: 'skill:' + s.name, body: s.description }))
    },
    memory: async ({ provider } = {}) => {
        if (!provider) return []
        try {
            const out = await provider.prefetch('')
            return (out.items || []).slice(0, 5).map((it, i) => ({ name: 'memory:' + i, body: typeof it === 'string' ? it : JSON.stringify(it) }))
        } catch { return [] }
    },
}

export async function buildContext({ session = null, message = '', plugins = ['file'], options = {} } = {}) {
    const blocks = []
    for (const name of plugins) {
        const p = ContextPlugins[name]
        if (!p) continue
        const got = await p({ session, message, ...options })
        for (const b of got) blocks.push(b)
    }
    return blocks
}

export function blocksToSystemMessage(blocks) {
    if (!blocks.length) return null
    const body = blocks.map(b => `[${b.name}]\n${b.body}`).join('\n\n')
    return { role: 'system', content: body }
}
