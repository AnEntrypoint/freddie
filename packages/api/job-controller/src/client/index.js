import { ClientJobsModel } from './model.js'
import { ClientJobs } from './service.js'

export { ClientJobsModel, JobsSnapshot } from './model.js'
export { ClientJobs } from './service.js'

export const inject = ['remote', 'remote.job']

export function apply(ctx) {
  const { remote } = ctx
  const { job } = remote
  new ClientJobs(ctx, { $stream: options => remote.$stream(options), job }, new ClientJobsModel())
}
