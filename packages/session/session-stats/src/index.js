import { sessionStatsProjectionDefinition } from './projection.js'

export const name = 'session-stats'
export const inject = ['sessionProjections']

export function apply(ctx) {
  ctx.sessionProjections.register(sessionStatsProjectionDefinition)
}
