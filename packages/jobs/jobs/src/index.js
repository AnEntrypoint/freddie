import { Service } from '@freddie/cordis'

export { JobId } from './types.js'

export class JobRegistry extends Service {
  constructor(ctx) {
    if (new.target === JobRegistry) {
      throw new Error('@freddie/freddie-jobs is the abstract job registry seam; load an implementation such as @freddie/freddie-jobs-local instead')
    }
    super(ctx, 'jobs')
  }

  start(spec) { throw new Error('@freddie/freddie-jobs: start() is abstract; implement it in a JobRegistry subclass') }

  list(caller) { throw new Error('@freddie/freddie-jobs: list() is abstract; implement it in a JobRegistry subclass') }

  get(id, caller) { throw new Error('@freddie/freddie-jobs: get() is abstract; implement it in a JobRegistry subclass') }

  read(id, caller) { throw new Error('@freddie/freddie-jobs: read() is abstract; implement it in a JobRegistry subclass') }

  kill(id, caller, reason) { throw new Error('@freddie/freddie-jobs: kill() is abstract; implement it in a JobRegistry subclass') }

  wait(id, timeoutMs, caller, signal) { throw new Error('@freddie/freddie-jobs: wait() is abstract; implement it in a JobRegistry subclass') }

  onJobDone(listener) { throw new Error('@freddie/freddie-jobs: onJobDone() is abstract; implement it in a JobRegistry subclass') }

  onJobsChanged(listener) { throw new Error('@freddie/freddie-jobs: onJobsChanged() is abstract; implement it in a JobRegistry subclass') }

  attachController(name) { throw new Error('@freddie/freddie-jobs: attachController() is abstract; implement it in a JobRegistry subclass') }
}

export default JobRegistry
