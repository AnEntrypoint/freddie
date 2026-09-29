/**
 * Image offload executor for the compaction seam. When an image-capable route
 * fails a request with `IMAGE_OFFLOAD_REQUIRED`, the plugin records one
 * `image/offload` decision selecting the oldest retained input occurrences
 * and retries through the agent request-error waterfall. Every route sends
 * placeholder text for those occurrences in subsequent requests.
 *
 * @module @freddie/freddie-compaction-image-offload
 */

import z from '@freddie/schemastery'
import { offloadOldestImages } from './image-offload.js'

export { imageOffloadProjection } from './projection.js'
export { offloadMessageImages } from './project-message.js'
export { offloadOldestImages, selectOldestImageTargets } from './image-offload.js'

/**
 * Failure code an image-capable adapter raises when a request exceeds its route
 * image budget. Freddie's adapters bound image payloads transiently instead of
 * raising it, so this executor owns the code until an adapter reports a count.
 */
export const IMAGE_OFFLOAD_REQUIRED_CODE = 'IMAGE_OFFLOAD_REQUIRED'

export const name = 'compaction-image-offload'
export const inject = []

/** Runtime schema for the empty executor config. */
export const Config = z.object({})

/**
 * Mount request-error recovery without configuration.
 * @param ctx - plugin context that owns the listener.
 */
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
