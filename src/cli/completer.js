import fs from 'node:fs'
import path from 'node:path'
import { COMMAND_REGISTRY } from '../commands/registry.js'

export class SlashCommandCompleter {
    constructor({ commands = COMMAND_REGISTRY } = {}) {
        this.commands = commands
        this.names = []
        for (const c of commands) { this.names.push(c.name); for (const a of c.aliases || []) this.names.push(a) }
    }
    suggest(line) {
        if (!line.startsWith('/')) return []
        const stripped = line.slice(1)
        const space = stripped.indexOf(' ')
        if (space === -1) {
            return this.names.filter(n => n.startsWith(stripped)).map(n => ({ value: '/' + n, kind: 'command', display: '/' + n + this._argHint(n) }))
        }
        const cmd = stripped.slice(0, space)
        const def = this.commands.find(c => c.name === cmd || (c.aliases || []).includes(cmd))
        if (!def) return []
        return [{ value: line, kind: 'args', display: '/' + def.name + ' ' + (def.args_hint || ''), description: def.description }]
    }
    _argHint(name) {
        const def = this.commands.find(c => c.name === name || (c.aliases || []).includes(name))
        return def?.args_hint ? ' ' + def.args_hint : ''
    }
}

export class PathCompleter {
    constructor({ cwd = process.cwd(), maxResults = 20, includeHidden = false } = {}) {
        this.cwd = cwd
        this.maxResults = maxResults
        this.includeHidden = includeHidden
    }
    suggest(input) {
        try {
            const abs = path.isAbsolute(input) ? input : path.resolve(this.cwd, input)
            const dir = input.endsWith('/') || input.endsWith(path.sep) ? abs : path.dirname(abs)
            const stem = input.endsWith('/') || input.endsWith(path.sep) ? '' : path.basename(abs)
            if (!fs.existsSync(dir)) return []
            const ents = fs.readdirSync(dir, { withFileTypes: true })
            const out = []
            for (const e of ents) {
                if (!this.includeHidden && e.name.startsWith('.')) continue
                if (!e.name.toLowerCase().startsWith(stem.toLowerCase())) continue
                const isDir = e.isDirectory()
                const value = path.join(dir, e.name) + (isDir ? path.sep : '')
                out.push({ value, kind: isDir ? 'dir' : 'file', display: e.name + (isDir ? '/' : '') })
                if (out.length >= this.maxResults) break
            }
            return out
        } catch { return [] }
    }
}

export class FuzzyMatcher {
    constructor(items, { keyFn = (x) => String(x) } = {}) {
        this.items = items
        this.keyFn = keyFn
    }
    score(query, target) {
        const q = query.toLowerCase()
        const t = target.toLowerCase()
        if (!q) return 1
        if (t === q) return 1000
        if (t.startsWith(q)) return 500 - (t.length - q.length)
        if (t.includes(q)) return 250 - (t.length - q.length)
        let qi = 0, score = 0, prev = -1
        for (let i = 0; i < t.length && qi < q.length; i++) {
            if (t[i] === q[qi]) { score += (i - prev === 1 ? 5 : 1); prev = i; qi++ }
        }
        return qi === q.length ? score : 0
    }
    match(query, { limit = 10 } = {}) {
        const scored = []
        for (const it of this.items) {
            const s = this.score(query, this.keyFn(it))
            if (s > 0) scored.push({ item: it, score: s })
        }
        scored.sort((a, b) => b.score - a.score)
        return scored.slice(0, limit).map(s => s.item)
    }
}

export function createCompleter({ cwd } = {}) {
    const slash = new SlashCommandCompleter()
    const file = new PathCompleter({ cwd })
    return {
        suggest(line, cursor = line.length) {
            const before = line.slice(0, cursor)
            if (before.startsWith('/')) return slash.suggest(before)
            const lastSpace = before.lastIndexOf(' ')
            const tok = before.slice(lastSpace + 1)
            if (tok.startsWith('./') || tok.startsWith('/') || tok.startsWith('~') || tok.includes('/')) return file.suggest(tok)
            return []
        },
    }
}
