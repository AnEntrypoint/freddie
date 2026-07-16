// registerDebug('naming', ...) — live naming-debt metric (comment count per
// file, per scripts/lint.mjs's computeNamingDebt) without re-spawning the
// whole lint script per request. Caches the last run for CACHE_MS.
import { listJsFiles, computeNamingDebt } from '../../scripts/lint.mjs'
import { registerDebug } from '../../src/observability/debug.js'

const CACHE_MS = 60_000
let cached = null
let cachedAt = 0

function snapshot() {
    const now = Date.now()
    if (cached && now - cachedAt < CACHE_MS) return cached
    const debt = computeNamingDebt(listJsFiles())
    cached = { computed_at: new Date(now).toISOString(), total: debt.total, files_with_comments: debt.files_with_comments, top: debt.rows.slice(0, 20) }
    cachedAt = now
    return cached
}

export default {
    name: 'debug-naming', surfaces: 'pi',
    register() {
        registerDebug('naming', snapshot)
    },
}
