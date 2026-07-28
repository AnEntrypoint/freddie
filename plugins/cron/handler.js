import { parseCron, matches } from '../../src/cron/cron-parse.js'

// Lazily import the backend so browser environments (no libsql) degrade gracefully
let _backend = null
async function backend() {
    if (_backend) return _backend
    try {
        _backend = await import('../../src/cron/scheduler.js')
        return _backend
    } catch (_) {
        _backend = { unavailable: true }
        return _backend
    }
}

// Compute the next fire time for a cron expression within the next 5 years.
// Returns an ISO string or null if no match found.
function nextFireAt(cronExpr, from = new Date()) {
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
function validateFiresWithin5Years(cronExpr) {
    const nf = nextFireAt(cronExpr)
    if (!nf) throw new Error(`cron expression "${cronExpr}" will never fire (no match in the next 5 years)`)
}

// Generate a human-readable description of a 5-field cron expression.
function humanSchedule(cronExpr) {
    const parts = cronExpr.trim().split(/\s+/)
    const [min, hour, dom, mon, dow] = parts

    const isEvery = (f) => f === '*'
    const isStep = (f) => f.includes('/')
    const stepVal = (f) => isStep(f) ? f.split('/')[1] : null
    const isSingle = (f) => /^\d+$/.test(f)
    const dayNames = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' }
    const monthNames = { 1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June', 7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December' }

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
function ageDays(created) {
    if (!created) return 0
    return Math.round((Date.now() - created) / 86400000 * 10) / 10
}

// Format a raw job row into the public shape
function formatJob(j) {
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

export const cronCreateTool = {
    name: 'cron_create',
    toolset: 'core',
    schema: {
        name: 'cron_create',
        description: 'Schedule a prompt to be enqueued at a future time. Use 5-field cron in local timezone.',
        parameters: {
            type: 'object',
            properties: {
                cron: { type: 'string', description: '5-field cron expression: M H DoM Mon DoW' },
                prompt: { type: 'string', description: 'The prompt to enqueue at each fire time. Max 8KB.' },
                recurring: { type: 'boolean', description: 'true = repeat on schedule, false = fire once then auto-delete', default: true },
            },
            required: ['cron', 'prompt'],
        },
    },
    handler: async (args, ctx) => {
        const be = await backend()
        if (be.unavailable) return { error: 'cron backend unavailable (browser or missing libsql)' }

        const { cron, prompt, recurring = true } = args

        // Validate cron expression
        try {
            parseCron(cron)
        } catch (e) {
            return { error: `invalid cron expression: ${e.message}` }
        }

        // Validate it fires at least once in the next 5 years
        try {
            validateFiresWithin5Years(cron)
        } catch (e) {
            return { error: e.message }
        }

        // Validate prompt length
        if (prompt.length > 8192) return { error: 'prompt exceeds 8KB limit' }

        const sessionId = ctx?.sessionKey || null
        const job = await be.createJob({ cron, prompt, recurring, sessionId })

        return {
            id: String(job.id),
            cron: job.cron,
            humanSchedule: humanSchedule(job.cron),
            recurring: !!job.recurring,
            nextFireAt: nextFireAt(job.cron) || 'never',
        }
    },
}

export const cronDeleteTool = {
    name: 'cron_delete',
    toolset: 'core',
    schema: {
        name: 'cron_delete',
        description: 'Cancel a scheduled cron job by id.',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'The cron job id' },
            },
            required: ['id'],
        },
    },
    handler: async (args) => {
        const be = await backend()
        if (be.unavailable) return { error: 'cron backend unavailable (browser or missing libsql)' }

        try {
            await be.deleteJob(Number(args.id))
            return { ok: true, deleted: true }
        } catch (e) {
            return { error: e.message || 'failed to delete cron job' }
        }
    },
}

export const cronListTool = {
    name: 'cron_list',
    toolset: 'core',
    schema: {
        name: 'cron_list',
        description: 'List all cron jobs currently scheduled in this session.',
        parameters: {
            type: 'object',
            properties: {},
        },
    },
    handler: async (args, ctx) => {
        const be = await backend()
        if (be.unavailable) return { error: 'cron backend unavailable (browser or missing libsql)' }

        const sessionId = ctx?.sessionKey || null
        const jobs = await be.listJobs({ sessionId })
        return { cron_jobs: jobs.map(formatJob) }
    },
}