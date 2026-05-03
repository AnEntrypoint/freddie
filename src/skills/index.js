import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import os from 'node:os'
import { getFreddieHome } from '../home.js'

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/

export function listSkills(extraDirs = []) {
    const dirs = [path.join(getFreddieHome(), 'skills'), path.join(process.cwd(), 'skills'), ...extraDirs]
    const out = []
    for (const d of dirs) {
        if (!fs.existsSync(d)) continue
        walk(d, out)
    }
    return out.filter(s => platformOk(s))
}

function walk(d, out) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name)
        if (entry.isDirectory()) { walk(full, out); continue }
        if (entry.name === 'SKILL.md') out.push(loadSkill(full))
    }
}

export function loadSkill(file) {
    const raw = fs.readFileSync(file, 'utf8')
    const m = FRONTMATTER.exec(raw)
    if (!m) return { file, name: path.basename(path.dirname(file)), description: '', body: raw, frontmatter: {} }
    const fm = yaml.load(m[1]) || {}
    return { file, name: fm.name || path.basename(path.dirname(file)), description: fm.description || '', frontmatter: fm, body: m[2], platforms: fm.platforms }
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
