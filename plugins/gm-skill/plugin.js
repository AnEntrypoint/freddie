import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'

const _require = createRequire(import.meta.url)

function resolveSkillMd() {
    const home = process.env.USERPROFILE || process.env.HOME
    if (home) {
        const candidates = [
            path.join(home, '.agents', 'skills', 'gm-skill', 'SKILL.md'),
            path.join(home, '.claude', 'skills', 'gm-skill', 'SKILL.md'),
        ]
        for (const p of candidates) {
            if (fs.existsSync(p)) return p
        }
    }
    for (const pkg of ['gm-skill', 'gm-cc']) {
        try {
            const pkgPath = _require.resolve(`${pkg}/package.json`)
            const candidate = path.join(path.dirname(pkgPath), 'skills', 'gm-skill', 'SKILL.md')
            if (fs.existsSync(candidate)) return candidate
        } catch {}
    }
    return null
}

function parseFrontmatter(md) {
    const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    if (!m) return { fields: {}, body: md }
    const fields = {}
    for (const line of m[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
        if (kv) fields[kv[1]] = kv[2]
    }
    return { fields, body: m[2] }
}

export default {
    name: 'gm-skill',
    surfaces: 'pi',
    register({ pi, log }) {
        const warn = (msg, data) => { try { (log && log.warn) ? log.warn(msg, data) : console.warn(`[gm-skill] ${msg}`, data || '') } catch {} }
        const skillPath = resolveSkillMd()
        if (!skillPath) {
            warn('SKILL.md unresolvable; gm-skill not registered. Run `bun x gm-plugkit@latest spool` to provision it, or install the gm-skill package.', {
                searched: ['~/.agents/skills/gm-skill/SKILL.md', '~/.claude/skills/gm-skill/SKILL.md', 'node_modules: gm-skill, gm-cc'],
            })
            return
        }
        let raw, fields, body
        try {
            raw = fs.readFileSync(skillPath, 'utf8')
            ;({ fields, body } = parseFrontmatter(raw))
        } catch (e) {
            warn('failed reading/parsing SKILL.md; gm-skill not registered', { file: skillPath, error: e && e.message })
            return
        }
        pi.skills.register({
            name: 'gm-skill',
            description: fields.description || 'AI-native software engineering harness',
            content: body,
            source: 'gm-skill',
            frontmatter: fields,
            file: skillPath,
        })
    },
}
