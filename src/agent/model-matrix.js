import fs from 'node:fs'
import path from 'node:path'

const MATRIX_PATH = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..', '..', '.gm', 'model-availability.json')
const MATRIX_TTL_MS = 24 * 60 * 60 * 1000
let _cache = null

export function loadMatrix() {
    if (_cache && Date.now() - _cache.loadedAt < 60_000) return _cache.data
    if (!fs.existsSync(MATRIX_PATH)) return null
    try {
        const data = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'))
        if (Date.now() - new Date(data.timestamp).getTime() > MATRIX_TTL_MS) return null
        _cache = { data, loadedAt: Date.now() }
        return data
    } catch { return null }
}

export function matrixUsable(provider, model) {
    const m = loadMatrix(); if (!m) return null
    const p = m.providers.find(x => x.id === provider); if (!p) return null
    if (!model) return p.models.some(mm => mm.usable_in_any_mode)
    const mm = p.models.find(x => x.id === model || x.id === model.replace(/^[^/]+\//, ''))
    return mm ? mm.usable_in_any_mode : null
}

export const MATRIX_FILE = MATRIX_PATH
