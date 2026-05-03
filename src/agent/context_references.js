import fs from 'node:fs'
import path from 'node:path'
import { getMessages } from '../sessions.js'

const REF_RE = /@(file:|url:|session:)?(\S+)/g

export async function resolveReferences(text, { cwd = process.cwd(), maxFile = 50_000 } = {}) {
    if (!text || typeof text !== 'string') return text
    const refs = [...text.matchAll(REF_RE)]
    if (!refs.length) return text
    let out = text
    for (const r of refs) {
        const kind = (r[1] || '').replace(':', '') || guessKind(r[2])
        const target = r[2]
        const expansion = await expand(kind, target, { cwd, maxFile })
        if (expansion) out = out.replace(r[0], `${r[0]}\n\n\`\`\`\n${expansion}\n\`\`\``)
    }
    return out
}
function guessKind(t) {
    if (/^https?:\/\//.test(t)) return 'url'
    if (/^[a-f0-9-]{8,}$/.test(t)) return 'session'
    return 'file'
}
async function expand(kind, target, { cwd, maxFile }) {
    if (kind === 'file') {
        const p = path.resolve(cwd, target.replace(/^\.\/?/, ''))
        if (!fs.existsSync(p)) return null
        const buf = fs.readFileSync(p, 'utf8')
        return buf.length > maxFile ? buf.slice(0, maxFile) + '\n…[truncated]' : buf
    }
    if (kind === 'url') {
        try { const r = await fetch(target); return (await r.text()).slice(0, maxFile) } catch (e) { return null }
    }
    if (kind === 'session') {
        const msgs = getMessages(target)
        return msgs.map(m => `[${m.role}] ${m.content}`).join('\n').slice(0, maxFile)
    }
    return null
}
