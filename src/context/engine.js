import fs from 'node:fs'
import path from 'node:path'
import { listSkills } from '../skills/index.js'
import { mergeAgentsMd } from './agents_md_merge.js'

export const ContextPlugins = {
    file: async ({ cwd = process.cwd() } = {}) => {
        const blocks = []
        // .freddie-context — project-local override, read first
        const fcPath = path.join(cwd, '.freddie-context')
        if (fs.existsSync(fcPath)) blocks.push({ name: 'file:.freddie-context', body: fs.readFileSync(fcPath, 'utf8') })
        // AGENTS.md/CLAUDE.md merged root→leaf up the directory tree (kimi parity)
        const merged = mergeAgentsMd(cwd)
        if (merged) blocks.push({ name: 'file:AGENTS.md', body: merged })
        return blocks
    },
    skills: async () => {
        return listSkills().map(s => ({ name: 'skill:' + s.name, body: s.description }))
    },
    memory: async ({ message = '', namespace = null } = {}) => {
        // Query-aware semantic recall from gm rs-learn — freddie's primary learning store.
        try {
            const { recall, projectNamespace } = await import('../learn/gm-learn.js')
            const ns = namespace || await projectNamespace()
            const q = (message || '').toString().trim() || 'project notes facts decisions'
            const hits = await recall(q, { limit: 5, namespace: ns })
            return hits.map((h, i) => ({ name: 'memory:' + i, body: h.text }))
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
