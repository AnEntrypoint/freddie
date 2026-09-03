import { parseCron, matches } from '../../src/cron/cron-parse.js'

// Compute the next fire time for a cron expression within the next 5 years.
// Returns an ISO string or null if no match found.
export function nextFireAt(cronExpr, from = new Date()) {
    const parsed = parseCron(cronExpr)
    const max = new Date(from.getTime() + 5 * 365.25 * 86400000) // ~5 years
    const cur = new Date(from)
    cur.setSeconds(0, 0)
    cur.setMinutes(cur.getMinutes() + 1) // start from the next minute
    while (cur <= max) {
        if (matches(parsed, cur)) return cur.toISOString()
        cur.setMinutes(cur.getMinutes() + 1)
    }
    return null
}

// Validate that the cron expression will fire at least once in the next 5 years.
export function validateFiresWithin5Years(cronExpr) {
    const nf = nextFireAt(cronExpr)
    if (!nf) throw new Error(`cron expression "${cronExpr}" will never fire (no match in the next 5 years)`)
}

// Generate a human-readable description of a 5-field cron expression.
export function humanSchedule(cronExpr) {
    const parts = cronExpr.trim().split(/\s+/)
    const [min, hour, dom, mon, dow] = parts

    const isEvery = (f) => f === '*'
    const isStep = (f) => f.includes('/')
    const stepVal = (f) => isStep(f) ? f.split('/')[1] : null
    const isSingle = (f) => /^\d+$/.test(f)
    const dayNames = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' }

    // Every minute
    if (isEvery(min) && isEvery(hour) && isEvery(dom) && isEvery(mon) && isEvery(dow)) return 'Every minute'

    // Step-based minute patterns
    if (isStep(min) && isEvery(hour) && isEvery(dom) && isEvery(mon) && isEvery(dow)) return `Every ${stepVal(min)} minutes`

    // Specific minute, every hour
    if (isSingle(min) && isEvery(hour) && isEvery(dom) && isEvery(mon) && isEvery(dow)) {
        const m = parseInt(min)
        if (m === 0) return 'Every hour'
        return `Every hour at :${min.padStart(2, '0')}`
    }

    // Daily at specific time
    if (isSingle(min) && isSingle(hour) && isEvery(dom) && isEvery(mon) && isEvery(dow)) {
        return `Every day at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
    }

    // Specific day of week
    if (isSingle(min) && isSingle(hour) && isEvery(dom) && isEvery(mon) && isSingle(dow)) {
        return `Every ${dayNames[parseInt(dow)] || dow} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
    }

    // Specific day of month
    if (isSingle(min) && isSingle(hour) && isSingle(dom) && isEvery(mon) && isEvery(dow)) {
        const d = parseInt(dom)
        const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'
        return `Every ${d}${suffix} of the month at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
    }

    // Step-based hour
    if (isSingle(min) && isStep(hour) && isEvery(dom) && isEvery(mon) && isEvery(dow)) {
        return `Every ${stepVal(hour)} hours at :${min.padStart(2, '0')}`
    }

    // Fallback: return the raw expression
    return `cron: ${cronExpr}`
}

// Compute age in days since creation
export function ageDays(created) {
    if (!created) return 0
    return Math.round((Date.now() - created) / 86400000 * 10) / 10
}

// Format a raw job row into the public shape
export function formatJob(j) {
    return {
        id: String(j.id),
        cron: j.cron,
        humanSchedule: humanSchedule(j.cron),
        prompt: j.prompt,
        nextFireAt: nextFireAt(j.cron) || 'never',
        recurring: !!j.recurring,
        ageDays: ageDays(j.created),
        stale: false, // always false for now; could be computed from last_run age
    }
}
