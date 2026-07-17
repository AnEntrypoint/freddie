import { listJobs, createJob, cancelJob, deleteJob, tick, startScheduler, stopScheduler } from '../../../src/cron/scheduler.js'
import { cronjobTool } from './lib/cronjob-tool.js'
export default {
    name: 'core-cron', surfaces: 'pi',
    register({ pi }) {
        pi.crons.register({ name: 'scheduler', list: listJobs, create: createJob, cancel: cancelJob, delete: deleteJob, tick, start: startScheduler, stop: stopScheduler })
        pi.tools.register(cronjobTool)
    },
}
