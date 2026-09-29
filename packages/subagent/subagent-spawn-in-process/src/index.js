/**
 * The in-process SPAWN subagent backend: registers a
 * {@link import('@freddie/freddie-subagent/src/types.js').SubagentProvider} on
 * `ctx.subagents` that runs each child as a fresh child
 * {@link import('@freddie/freddie-agent').Agent} on the same cordis
 * context (its own session, own system prompt, zero parent context). The cheapest transport,
 * reusing the agent factory's quiescent teardown.
 * @module @freddie/freddie-subagent-spawn-in-process
 */

import z from '@freddie/schemastery'
import { startInProcessRun } from '@freddie/freddie-subagent-in-process-driver'

export const name = 'subagent-spawn-in-process'
export const inject = ['subagents']

export const Config = z.object({
  providerName: z.string().default('spawn'),
})

/**
 * The spawn provider. Supports every start-time capability: `depthLimit` (it
 * constructs the child, so it can enforce a recursion cap), `outputSchema`
 * (the scoped structured runtime), and `toolFilter`/`persona` (scoped
 * `restrict()` and a scoped shadowing persona section, applied in the child's
 * creation window).
 */
class SpawnInProcessProvider {
  capabilities = { outputSchema: true, depthLimit: true, toolFilter: true, persona: true }
  inheritsParentContext = false

  constructor(name) {
    this.name = name
  }

  start(request) {
    return startInProcessRun(request, {})
  }

  prepareContinuable() {
    return Promise.resolve({})
  }
}

export function apply(ctx, config) {
  ctx.subagents.registerProvider(new SpawnInProcessProvider(config.providerName))
}
