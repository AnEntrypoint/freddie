import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'

const _require = createRequire(import.meta.url)

function resolveSkillMd() {
    const home = process.env.USERPROFILE || process.env.HOME
    if (home) {
        const userSkill = path.join(home, '.claude', 'skills', 'gm-skill', 'SKILL.md')
        if (fs.existsSync(userSkill)) return userSkill
    }
    try {
        const pkgPath = _require.resolve('gm-cc/package.json')
        const candidate = path.join(path.dirname(pkgPath), 'skills', 'gm-skill', 'SKILL.md')
        if (fs.existsSync(candidate)) return candidate
    } catch {}
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
    register({ pi }) {
        const skillPath = resolveSkillMd()
        if (!skillPath) return
        const raw = fs.readFileSync(skillPath, 'utf8')
        const { fields, body } = parseFrontmatter(raw)
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
