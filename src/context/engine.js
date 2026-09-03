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
        // Bounded the same way every other gm-learn call site is (machine.js's
        // autoRecall 4s, turn_trajectory.js's autoLearn 8s, doctor.js's 12s) --
        // this is the only caller of recall() that raced nothing, so on a
        // process's first-ever gm-learn call it could otherwise block for the
        // full one-time backend-init probe window (see gm-learn-backend.js).
        const MEMORY_RECALL_TIMEOUT_MS = 5000
        try {
            const { recall, projectNamespace } = await import('../learn/gm-learn.js')
            const ns = namespace || await projectNamespace()
            const q = (message || '').toString().trim() || 'project notes facts decisions'
            const abort = new AbortController()
            let timer
            const hits = await Promise.race([
                recall(q, { limit: 5, namespace: ns, signal: abort.signal }).finally(() => clearTimeout(timer)),
                new Promise((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error('memory recall timeout')) }, MEMORY_RECALL_TIMEOUT_MS) }),
            ])
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
