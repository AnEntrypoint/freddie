import { createJob, listJobs, cancelJob, deleteJob } from '../../../../src/cron/scheduler.js'

const ACTIONS = {
    add: async ({ cron, prompt, model = null }) => ({ id: await createJob({ cron, prompt, model }) }),
    list: async () => ({ jobs: await listJobs() }),
    cancel: async ({ id }) => { await cancelJob(id); return { id, cancelled: true } },
    delete: async ({ id }) => { await deleteJob(id); return { id, deleted: true } },
}

export const cronjobTool = ({
    name: 'cronjob',
    toolset: 'core',
    schema: { name: 'cronjob', description: 'Manage agent cron jobs (add, list, cancel, delete).', parameters: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(ACTIONS) }, cron: { type: 'string' }, prompt: { type: 'string' }, model: { type: 'string' }, id: { type: 'number' } }, required: ['action'] } },
    handler: async (args) => { const fn = ACTIONS[args.action]; if (!fn) return { error: 'unknown action' }; try { return await fn(args) } catch (e) { return { error: String(e.message || e) } } },
})
