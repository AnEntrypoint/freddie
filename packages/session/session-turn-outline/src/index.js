import { turnOutlineProjectionDefinition } from './projection.js'

export const name = 'session-turn-outline'
export const inject = ['sessionProjections']

export function apply(ctx) {
  ctx.sessionProjections.register(turnOutlineProjectionDefinition)
}
