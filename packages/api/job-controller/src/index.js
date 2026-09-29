import z from '@freddie/schemastery'
import { Remote, TypertLookupFailure, TypertRemoteService } from '@freddie/freddie-typert-protocol'
import { streamJobRows } from './rows.js'

const DEFAULT_OBSERVE_FLUSH_MS = 100

const HUMAN_KILL_REASON = 'cancelled by the user'

export class JobController extends TypertRemoteService {
  static inject = ['jobs', 'typert']

  static Config = z.object({
    observeFlushMs: z.natural().min(1).default(DEFAULT_OBSERVE_FLUSH_MS),
  })

  observeFlushMs

  constructor(ctx, config) {
    super(ctx, 'jobController', { namespace: 'job' })
    this.observeFlushMs = config.observeFlushMs
    ctx.effect(() => ctx.jobs.attachController('job-controller'), 'job-controller.registry')
  }

  list(agent, signal) {
    return streamJobRows(this.ctx.jobs, agent, { flushMs: this.observeFlushMs }, signal)
  }

  kill(agent, request) {
    const jobs = this.ctx.jobs
    try {
      jobs.get(request.jobId, agent)
    } catch (error) {
      throw new TypertLookupFailure({
        code: 'job/not-found',
        message: error instanceof Error ? error.message : String(error),
        details: { sessionId: agent.id, jobId: request.jobId },
      })
    }
    return { outcome: jobs.kill(request.jobId, agent, HUMAN_KILL_REASON) }
  }
}

Remote('kill')(JobController.prototype.kill, {
  name: 'kill',
  private: false,
  static: false,
  addInitializer: (fn) => { fn.call(Object.create(JobController.prototype)) },
})

export default JobController
