import { gmProgressProjectionDefinition } from './projection.js'

export const name = 'gm-progress'
export const inject = ['sessionProjections']

export function apply(ctx) {
  ctx.sessionProjections.register(gmProgressProjectionDefinition)
}
