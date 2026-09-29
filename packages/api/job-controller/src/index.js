/**
 * Host job Remote owner: mirrors the background-job roster one session can see
 * and stops a job on a human's behalf. The roster is a projection of `ctx.jobs`;
 * the model's consuming cursor and notice state never observe it, and a human
 * kill is not the model's own, so the completion notice still reaches the
 * owning agent.
 * @module @freddie/freddie-job-controller
 */

import z from '@freddie/schemastery'
import { Remote, TypertLookupFailure, TypertRemoteService } from '@freddie/freddie-typert-protocol'
import { streamJobRows } from './rows.js'

/** Default coalescing window between roster reads, in milliseconds. */
const DEFAULT_OBSERVE_FLUSH_MS = 100

/** Reason recorded for a kill a human requested rather than the model. */
const HUMAN_KILL_REASON = 'cancelled by the user'

/** Job Controller deployment policy. */
export class JobController extends TypertRemoteService {
  /** Services required before the controller can serve registry reads and kills. */
  static inject = ['jobs', 'typert']

  static Config = z.object({
    observeFlushMs: z.natural().min(1).default(DEFAULT_OBSERVE_FLUSH_MS),
  })

  /** @type {number} */
  observeFlushMs

  /**
   * @param ctx - Host context carrying the live job registry.
   * @param config - roster coalescing policy.
   */
  constructor(ctx, config) {
    super(ctx, 'jobController', { namespace: 'job' })
    this.observeFlushMs = config.observeFlushMs
    ctx.effect(() => ctx.jobs.attachController('job-controller'), 'job-controller.registry')
  }

  /**
   * Stream the jobs one session can see — its own plus every unowned job — as
   * whole-set frames: one on open, then one after each coalesced burst of
   * lifecycle commits. The stream has no natural end; the carrier closes it.
   * @param agent - the session whose visible set to mirror.
   * @param signal - cancellation owned by the generation's consumer.
   * @returns the roster frames.
   */
  list(agent, signal) {
    return streamJobRows(this.ctx.jobs, agent, { flushMs: this.observeFlushMs }, signal)
  }

  /**
   * Kill one background job on a human's behalf. The job must be one the
   * session can see: the registry's owner fence is the only access rule, and a
   * child session's own jobs are killable from its list like any other. The
   * kill records `cancelled by the user` as its reason; it is not one the model
   * requested, so the owning agent still receives the completion notice, and a
   * shell tool waiting on that job reads the reason in its own result.
   * @param agent - the session whose job list carries the job.
   * @param request - the job id.
   * @returns the registry's admission of the kill request.
   */
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
