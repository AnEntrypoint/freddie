/**
 * Subagent settings card, node half: the `subagent` namespace the browser half
 * edits. The card itself ships in the browser half under exports["./client"],
 * discovered from the package.json freddie.client declaration.
 *
 * The namespace is registered here rather than imported because the delegation
 * stack composes its depth cap per tool instance; this section is the durable
 * deployment-level row the Plugins page exposes. Nothing in freddie reads it
 * yet — see the README's deferred work.
 */

import { settingsNamespace } from '@freddie/freddie-settings'
import z from '@freddie/schemastery'

/** The delegation-limits namespace this package's card edits. */
export const SUBAGENT_SETTINGS_NAMESPACE = 'subagent'

/** Namespace handle the settings service addresses. */
export const SUBAGENT_NS = settingsNamespace(SUBAGENT_SETTINGS_NAMESPACE)

/**
 * The two limits the card edits. Depth is capped below only by zero — a tool's
 * own tighter maximum still wins where the delegation stack applies one — and
 * capacity has a floor of one because a cap of zero would forbid delegation
 * outright through a field that means "how many at once". Neither carries an
 * upper bound: the safe-integer range is the delegation stack's own limit.
 * Five at once is the default because it is the smallest number a delegation
 * tree can fan out into without every sibling serialising behind one slot.
 */
export const Config = z.object({
  maxDepth: z.number().step(1).min(0).default(3),
  maxActiveSubagents: z.number().step(1).min(1).default(5),
})

/** Cordis plugin name used by loader diagnostics. */
export const name = 'client-ui-settings-subagent'

/**
 * Register the durable delegation-limits section when a settings service is
 * composed. Absent one the namespace simply does not exist, and the Plugins
 * page dispatches no card for it.
 * @param ctx - host context that may acquire the settings service.
 * @param config - the composed entry, layered as the section's base.
 */
export function apply(ctx, config = {}) {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(SUBAGENT_NS, Config, { base: config })
  })
}
