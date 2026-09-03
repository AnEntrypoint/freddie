// registerDebug('naming', ...) — live naming-debt metric (comment count per
// file, per scripts/lint.mjs's computeNamingDebt) without re-spawning the
// whole lint script per request. Caches the last run for CACHE_MS.
//
// DEV-ONLY, introspects freddie's OWN source checkout: scripts/lint.mjs is
// deliberately excluded from the published npm package (package.json's
// `files` whitelist is bin/src/plugins/skills/docs only -- scripts/ is dev
// tooling, correctly not shipped to a consumer) and this plugin's metric is
// only meaningful against freddie's own dev tree in the first place, never
// a consuming app's. Lazy-imported inside register() with a real try/catch
// (not a top-level import, which would throw at MODULE LOAD time and take
// down the whole plugin-discovery pass for every consumer -- live-witnessed:
// this exact top-level import crashed a consumer's (casey) entire boot with
// ERR_MODULE_NOT_FOUND, since bootHost's plugin discovery imports every
// plugins/*/plugin.js unconditionally) so an npm-installed consumer with no
// scripts/ directory silently gets no 'naming' debug registration instead of
// a hard crash -- the same degrade-gracefully discipline the rest of this
// plugin's own debug-registry surface already follows for an absent metric.
import { registerDebug } from '../../src/observability/debug.js'

const CACHE_MS = 60_000
let cached = null
let cachedAt = 0

async function snapshot() {
    const now = Date.now()
    if (cached && now - cachedAt < CACHE_MS) return cached
    const { listJsFiles, computeNamingDebt } = await import('../../scripts/lint.mjs')
    const debt = computeNamingDebt(listJsFiles())
    cached = { computed_at: new Date(now).toISOString(), total: debt.total, files_with_comments: debt.files_with_comments, top: debt.rows.slice(0, 20) }
    cachedAt = now
    return cached
}

export default {
    name: 'debug-naming', surfaces: 'pi',
    async register() {
        // scripts/lint.mjs is absent in an npm-installed consumer (see the
        // header comment) -- probe once at register time rather than on every
        // debug-snapshot call, so a consumer with no scripts/ dir gets a clean
        // one-time skip instead of a per-request import-failure retry.
        try {
            await import('../../scripts/lint.mjs')
        } catch {
            return
        }
        registerDebug('naming', snapshot)
    },
}
