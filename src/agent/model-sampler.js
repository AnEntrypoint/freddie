import { logger } from '../observability/log.js'

const log = logger('model-sampler')

const BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 240_000, 480_000]

const _cache = new Map()
let _interval = null

function entry(provider) {
    if (!_cache.has(provider)) _cache.set(provider, { ok: null, failCount: 0, nextCheck: 0 })
    return _cache.get(provider)
}

export function isAvailable(provider) {
    const e = entry(provider)
    if (e.nextCheck > Date.now()) return e.ok !== false
    return true
}

export function markFailed(provider) {
    const e = entry(provider)
    e.ok = false
    e.failCount = (e.failCount || 0) + 1
    const step = Math.min(e.failCount - 1, BACKOFF_STEPS_MS.length - 1)
    e.nextCheck = Date.now() + BACKOFF_STEPS_MS[step]
    log.info('marked_failed', { provider, failCount: e.failCount, nextCheckIn: BACKOFF_STEPS_MS[step] })
}

export function markOk(provider) {
    const e = entry(provider)
    e.ok = true
    e.failCount = 0
    e.nextCheck = 0
}

export function resetAvailability(provider) {
    _cache.delete(provider)
}

export function getStatus() {
    return Array.from(_cache.entries()).map(([provider, e]) => ({
        provider,
        ok: e.ok,
        failCount: e.failCount,
        nextCheckIn: Math.max(0, e.nextCheck - Date.now()),
    }))
}

export async function probe(provider, probeCall) {
    try {
        await probeCall()
        markOk(provider)
        return true
    } catch {
        markFailed(provider)
        return false
    }
}

export function startSampler(getProbes) {
    if (_interval) return
    _interval = setInterval(async () => {
        const probes = getProbes()
        await Promise.allSettled(probes.map(({ provider, call }) => {
            const e = entry(provider)
            if (e.nextCheck > Date.now()) return Promise.resolve()
            return probe(provider, call)
        }))
    }, 30_000)
    if (_interval.unref) _interval.unref()
}

export function stopSampler() {
    if (_interval) { clearInterval(_interval); _interval = null }
}
