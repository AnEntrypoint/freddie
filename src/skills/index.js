import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseFrontmatter } from 'plugsdk'
import { getFreddieHome } from '../home.js'

export function listSkills(extraDirs = []) {
    const dirs = [path.join(getFreddieHome(), 'skills'), path.join(process.cwd(), 'skills'), ...extraDirs]
    const out = []
    for (const d of dirs) if (fs.existsSync(d)) walk(d, out)
    return out.filter(platformOk)
}

function walk(d, out) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name)
        if (entry.isDirectory()) walk(full, out)
        else if (entry.name === 'SKILL.md') out.push(loadSkill(full))
    }
}

export function loadSkill(file) {
    const raw = fs.readFileSync(file, 'utf8')
    const { fields, body } = parseFrontmatter(raw)
    return {
        file,
        name: fields.name || path.basename(path.dirname(file)),
        description: fields.description || '',
        frontmatter: fields,
        body,
        platforms: fields.platforms,
    }
}

function platformOk(skill) {
    const plats = skill.platforms || skill.frontmatter?.platforms
    if (!Array.isArray(plats) || plats.length === 0) return true
    const platform = os.platform() === 'darwin' ? 'macos' : os.platform()
    return plats.includes(platform)
}

export function findSkill(name) { return listSkills().find(s => s.name === name) || null }

export function skillAsUserMessage(name, args = '') {
    const s = findSkill(name)
    if (!s) return null
    const prefix = args ? `Arguments: ${args}\n\n` : ''
    return { role: 'user', content: `[skill:${name}]\n${prefix}${s.body}` }
}
