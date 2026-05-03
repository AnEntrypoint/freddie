import { createJob, listJobs, cancelJob, deleteJob } from '../cron/scheduler.js'
import { registry } from './registry.js'

const ACTIONS = {
    add: ({ cron, prompt, model = null }) => ({ id: createJob({ cron, prompt, model }) }),
    list: () => ({ jobs: listJobs() }),
    cancel: ({ id }) => { cancelJob(id); return { id, cancelled: true } },
    delete: ({ id }) => { deleteJob(id); return { id, deleted: true } },
}

registry.register({
    name: 'cronjob',
    toolset: 'core',
    schema: { name: 'cronjob', description: 'Manage agent cron jobs (add, list, cancel, delete).', parameters: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(ACTIONS) }, cron: { type: 'string' }, prompt: { type: 'string' }, model: { type: 'string' }, id: { type: 'number' } }, required: ['action'] } },
    handler: async (args) => { const fn = ACTIONS[args.action]; if (!fn) return { error: 'unknown action' }; try { return fn(args) } catch (e) { return { error: String(e.message || e) } } },
})
