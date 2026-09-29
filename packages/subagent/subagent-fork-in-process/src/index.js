import z from '@freddie/schemastery'
import { startInProcessRun } from '@freddie/freddie-subagent-in-process-driver'

export const name = 'subagent-fork-in-process'
export const inject = ['subagents']

export const Config = z.object({
  providerName: z.string().default('fork'),
})

function completedTurnPrefix(parent) {
  const events = parent.session.events
  const lastEnd = events.findLast(e => e.type === 'turn/end')
  if (lastEnd === undefined) return []
  return events.slice(0, lastEnd.seq + 1)
}

class ForkInProcessProvider {
  capabilities = { outputSchema: true, depthLimit: true, toolFilter: true, persona: true }
  inheritsParentContext = true

  constructor(name) {
    this.name = name
  }

  start(request) {
    const seed = completedTurnPrefix(request.parent)
    return startInProcessRun(request, {
      ...seed.length > 0 ? { seed } : {},
    })
  }

  prepareContinuable(request) {
    const seed = completedTurnPrefix(request.parent)
    return Promise.resolve(seed.length > 0 ? { seed } : {})
  }
}

export function apply(ctx, config) {
  ctx.subagents.registerProvider(new ForkInProcessProvider(config.providerName))
}
