import { scopeTarget } from '@freddie/freddie-scope'

export function agentCarrier(agent) {
  return scopeTarget(agent, agent)
}

export function agentEvents(ctx, agent, carrier = agentCarrier(agent)) {
  const fused = (payload) => ({ ...payload, agent })
  return {
    emit(name, payload) {
      const args = [carrier, name, fused(payload)]
      const callbacks = ctx.events.dispatch('emit', args)
      for (const callback of callbacks) {
        try {
          const returned = callback(...args)
          void Promise.resolve(returned).catch((error) => {
            ctx.logger.warn(`agent event "${name}" listener rejected: ${String(error)}`)
          })
        } catch (error) {
          ctx.logger.warn(`agent event "${name}" listener threw: ${String(error)}`)
        }
      }
    },
    async serial(name, payload) {
      const serial = ctx.serial
      return await serial(carrier, name, fused(payload))
    },
    waterfall(name, payload, ...rest) {
      const waterfall = ctx.waterfall
      return waterfall(carrier, name, fused(payload), ...rest)
    },
  }
}

export function emitAgentEvent(ctx, agent, name, payload) {
  agentEvents(ctx, agent).emit(name, payload)
}

export function assembleContextFor(agent, signal) {
  return { agent, scope: agent, ...signal === undefined ? {} : { signal } }
}
