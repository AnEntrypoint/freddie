
import z from '@freddie/schemastery'
import { offloadOldestImages } from './image-offload.js'

export { imageOffloadProjection } from './projection.js'
export { offloadMessageImages } from './project-message.js'
export { offloadOldestImages, selectOldestImageTargets } from './image-offload.js'

export const IMAGE_OFFLOAD_REQUIRED_CODE = 'IMAGE_OFFLOAD_REQUIRED'

export const name = 'compaction-image-offload'
export const inject = []

export const Config = z.object({})

export function apply(ctx) {
  const dispose = ctx.on('agent/request-error', ({ agent, failure }, next) => {
    if (failure?.code !== IMAGE_OFFLOAD_REQUIRED_CODE) return next()
    if (failure.offloadImages === undefined) return next()
    if (!offloadOldestImages(agent.session, agent.session.surface.nodes, failure.offloadImages)) return next()
    return Promise.resolve({ kind: 'retry' })
  })
  ctx.effect(function* () {
    yield dispose
  })
}
