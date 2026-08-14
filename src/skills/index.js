import fs from 'node:fs'
import path from 'node:path'
import * as yaml from 'js-yaml'
import os from 'node:os'
import { getFreddieHome } from '../home.js'

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/

export function skillRootsByPrecedence(extraDirs = []) {
    const home = os.homedir()
    return [
        path.join(getFreddieHome(), 'skills'),
        path.join(process.cwd(), 'skills'),
        path.join(home, '.claude', 'skills'),
        path.join(home, '.agents', 'skills'),
        ...extraDirs,
    ]
}

export const skillRoots = skillRootsByPrecedence

const LIST_CACHE_TTL_MS = 2000
let _listCache = null

export function listSkills(extraDirs = []) {
    const cacheKey = extraDirs.join(' ')
    const now = Date.now()
    if (_listCache && _listCache.cacheKey === cacheKey && (now - _listCache.ts) < LIST_CACHE_TTL_MS) return _listCache.result

    const seenRoots = new Set()
    const out = []
    for (const d of skillRootsByPrecedence(extraDirs)) {
        const resolved = path.resolve(d)
        if (seenRoots.has(resolved) || !fs.existsSync(resolved)) continue
        seenRoots.add(resolved)
        walk(resolved, out)
    }
    const result = dedupeByFirstOccurrence(out.filter(platformOk))
    _listCache = { cacheKey, ts: now, result }
    return result
}

function dedupeByFirstOccurrence(skills) {
    const seenNames = new Set()
    const out = []
    for (const s of skills) {
        if (seenNames.has(s.name)) continue
        seenNames.add(s.name)
        out.push(s)
    }
    return out
}

function walk(d, out) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name)
        if (entry.isDirectory()) walk(full, out)
        else if (entry.name === 'SKILL.md') {
            try { out.push(loadSkill(full)) }
            catch (e) { console.error(`[skills] failed to load ${full}: ${e.message}`) }
        }
    }
}

// Top-level frontmatter is often hand-authored prose, not strict-YAML-authored --
// a plain scalar value containing an unescaped ': ' (e.g. "this skill is the
// tree root: load it first") is a real YAML grammar violation (ambiguous with a
// nested mapping) that every conformant parser rejects, js-yaml included. Rather
// than require every SKILL.md author to quote their prose, repair only the
// top-level (unindented) 'key: value' lines whose value contains that shape by
// wrapping the value in quotes, then retry the real parse.
const TOP_LEVEL_KV = /^([A-Za-z0-9_-]+):[ \t]+(.*)$/
function repairPlainScalarColons(block) {
    return block.split('\n').map(line => {
        const m = TOP_LEVEL_KV.exec(line)
        if (!m) return line
        const [, key, value] = m
        if (/^['"[{|>]/.test(value)) return line
        if (!/: /.test(value)) return line
        return `${key}: ${JSON.stringify(value)}`
    }).join('\n')
}

function loadFrontmatter(block) {
    try { return yaml.load(block) || {} }
    catch (e) {
        try { return yaml.load(repairPlainScalarColons(block)) || {} }
        catch { throw e }
    }
}

export function loadSkill(file) {
    const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    const dirName = path.basename(path.dirname(file))
    const m = FRONTMATTER.exec(raw)
    if (!m) return { file, name: dirName, description: '', body: raw, frontmatter: {} }
    const fm = loadFrontmatter(m[1])
    const name = fm.name || dirName
    return {
        file, name, description: fm.description || '', frontmatter: fm, body: m[2], platforms: fm.platforms,
        license: fm.license, allowedTools: fm['allowed-tools'] || fm.allowedTools, metadata: fm.metadata,
        nameMismatch: !!fm.name && fm.name !== dirName ? { frontmatterName: fm.name, dirName } : null,
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
