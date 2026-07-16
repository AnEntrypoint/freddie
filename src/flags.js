import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { getFreddieHome } from './home.js'

function flagsPath() {
    return path.join(getFreddieHome(), 'flags.json')
}

function loadFlags() {
    try { return JSON.parse(fs.readFileSync(flagsPath(), 'utf8')) } catch { return {} }
}

function saveFlags(flags) {
    fs.mkdirSync(path.dirname(flagsPath()), { recursive: true })
    fs.writeFileSync(flagsPath(), JSON.stringify(flags, null, 2))
}

// Stable per-install id for percentage rollouts -- derived from the install's
// own home path, not random, so the SAME install always lands in the same
// bucket for a given flag (no flickering on/off across requests/restarts).
function installId() {
    return crypto.createHash('sha256').update(getFreddieHome()).digest('hex')
}

function bucketFor(name) {
    const h = crypto.createHash('sha256').update(name + ':' + installId()).digest('hex')
    // First 8 hex chars -> a value in [0, 0xffffffff], normalized to [0, 100).
    return (parseInt(h.slice(0, 8), 16) / 0xffffffff) * 100
}

export function isFlagEnabled(name) {
    const flags = loadFlags()
    const entry = flags[name]
    if (entry === undefined) return true // undeclared flag defaults to on -- a flag is an opt-out kill switch, not an opt-in gate
    if (typeof entry === 'boolean') return entry
    if (typeof entry === 'object' && entry !== null && typeof entry.rollout_pct === 'number') {
        return bucketFor(name) < entry.rollout_pct
    }
    return true
}

export function listFlags() {
    const flags = loadFlags()
    return Object.entries(flags).map(([name, entry]) => ({ name, ...( typeof entry === 'boolean' ? { enabled: entry } : entry ), effective: isFlagEnabled(name) }))
}

export function enableFlag(name) {
    const flags = loadFlags()
    flags[name] = true
    saveFlags(flags)
}

export function disableFlag(name) {
    const flags = loadFlags()
    flags[name] = false
    saveFlags(flags)
}

export function rolloutFlag(name, pct) {
    if (typeof pct !== 'number' || pct < 0 || pct > 100) throw new Error('rollout pct must be a number between 0 and 100')
    const flags = loadFlags()
    flags[name] = { rollout_pct: pct }
    saveFlags(flags)
}
