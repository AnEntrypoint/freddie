/**
 * Job Controller client half: installs `ctx.jobs` (rosters and the human kill)
 * over the `job` Remote namespace. The plugin resolves both Remote faces it
 * drives while its own context is current, because stream (re)opens run on
 * caller stacks — a React event, a carrier retry — whose dynamic context has
 * not declared `remote.job`.
 * @module @freddie/freddie-job-controller/client
 */

import { ClientJobsModel } from './model.js'
import { ClientJobs } from './service.js'

export { ClientJobsModel, JobsSnapshot } from './model.js'
export { ClientJobs } from './service.js'

/** Required Client Remote services. */
export const inject = ['remote', 'remote.job']

/**
 * Install the client jobs service.
 * @param ctx - Client root Context.
 */
export function apply(ctx) {
  const { remote } = ctx
  const { job } = remote
  new ClientJobs(ctx, { $stream: options => remote.$stream(options), job }, new ClientJobsModel())
}
