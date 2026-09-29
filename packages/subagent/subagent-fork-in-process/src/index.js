/**
 * The in-process FORK subagent backend: registers a
 * {@link import('@freddie/freddie-subagent/src/types.js').SubagentProvider} on
 * `ctx.subagents` that runs each child as a child
 * {@link import('@freddie/freddie-agent').Agent} SEEDED with a prefix of the
 * parent's session log — so the child inherits the parent's conversation context instead of
 * starting fresh. The seed ends at the last `turn/end`: the current tool-call turn is
 * unbalanced and cannot be replayed as a valid child session.
 * @module @freddie/freddie-subagent-fork-in-process
 */

import z from '@freddie/schemastery'
import { startInProcessRun } from '@freddie/freddie-subagent-in-process-driver'

export const name = 'subagent-fork-in-process'
export const inject = ['subagents']

export const Config = z.object({
  providerName: z.string().default('fork'),
})

/**
 * The balanced completed-turn prefix of `parent`'s log: every event up to and including the
 * last `turn/end`. The in-flight turn is excluded; before any completed turn the child starts
 * fresh. Because live sequence numbers equal array indexes, the result remains a valid seed
 * beginning at sequence zero.
 * @param parent - the agent whose session log to slice.
 * @returns the seed events, contiguous from seq 0; empty when no turn has completed.
 */
function completedTurnPrefix(parent) {
  const events = parent.session.events
  const lastEnd = events.findLast(e => e.type === 'turn/end')
  if (lastEnd === undefined) return []
  return events.slice(0, lastEnd.seq + 1)
}

/**
 * The fork provider. Supports `depthLimit` and `outputSchema` (via the shared
 * in-process structured runtime), plus `toolFilter`/`persona` (scoped
 * restrict() and a scoped shadowing persona section).
 */
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
