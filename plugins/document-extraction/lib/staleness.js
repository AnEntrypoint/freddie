import { readLessons, writeLessons, withLessonsLock } from './lessons-store.js'

function readLastHash(lessonsContent) {
    if (typeof lessonsContent !== 'string') return null
    const m = lessonsContent.match(/^LAST_HASH:\s*([0-9a-f]{16,64})\s*$/m)
    return m ? m[1] : null
}

function stampHash(lessonsContent, hash) {
    const stripped = (lessonsContent || '').replace(/^LAST_HASH:.*\n?/m, '')
    return `LAST_HASH: ${hash}\n${stripped}`
}

function checkStaleUnsafe(documentType, contentHash, opts = {}) {
    const current = readLessons(documentType, opts.cwd)
    const lastHash = readLastHash(current)
    return { stale: lastHash !== null && lastHash === contentHash, lastHash, hasLessons: current !== null, current }
}

export async function withFreshLessons(documentType, contentHash, opts = {}, runExtraction) {
    return await withLessonsLock(documentType, async () => {
        const staleCheck = checkStaleUnsafe(documentType, contentHash, opts)
        if (staleCheck.stale) return { status: 'stale', skipped: true }
        const lessons = staleCheck.current || ''
        const result = await runExtraction(lessons)
        if (!result.rejected) writeLessons(documentType, stampHash(staleCheck.current || '', contentHash), opts.cwd)
        return result
    })
}
