import { parseCron } from '../../src/cron/cron-parse.js'
import { nextFireAt, validateFiresWithin5Years, humanSchedule, formatJob } from './schedule-format.js'

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