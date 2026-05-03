import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
const RE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/
function parse(text) {
    const out = {}
    for (const line of String(text).split('\n')) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const m = t.match(RE)
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    return out
}
export function loadEnvFile(file = null) {
    const candidates = file ? [file] : [path.join(getFreddieHome(), '.env'), path.join(process.cwd(), '.env')]
    const merged = {}
    for (const f of candidates) if (fs.existsSync(f)) Object.assign(merged, parse(fs.readFileSync(f, 'utf8')))
    return merged
}
export function applyEnvFile(file = null) {
    const env = loadEnvFile(file)
    for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v
    return Object.keys(env).length
}
