import { Context as CordisContext } from '@freddie/cordis'

const kScope = Symbol.for('freddie.client.scope')

function agentScope() {}

export function createScope(ctx, key) {
  const fiber = ctx.plugin(agentScope)
  const scoped = fiber.ctx.extend({
    [kScope]: key,
    [CordisContext.filter](listenerCtx) {
      const tag = scopeOf(listenerCtx)
      return tag === undefined || tag === key
    },
  })
  return {
    fiber,
    ctx: scoped,
  }
}

export function scopeOf(ctx) {
  return ctx[kScope]
}
