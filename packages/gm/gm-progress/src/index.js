/** Host projection of complete, committed GM progress snapshots. */

import { gmProgressProjectionDefinition } from './projection.js'

export const name = 'gm-progress'
export const inject = ['sessionProjections']

/** Register the GM projection; the registry owns delivery and cache lifecycle. */
export function apply(ctx) {
  ctx.sessionProjections.register(gmProgressProjectionDefinition)
}
