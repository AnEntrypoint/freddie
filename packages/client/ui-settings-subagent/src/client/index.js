/**
 * Subagent settings card, browser half. It registers into the Plugins page's
 * `settings.plugin.item` slot under the namespace it edits, so the Plugin
 * configuration tab pairs it with the Host section of the same name and
 * dispatches it only while that namespace is served.
 */

import { SubagentCard } from './SubagentCard.js'
import { SUBAGENT_NS, SubagentCardController } from './subagent-card-controller.js'
import { en } from './locales.js'

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.subagent'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'settingsScope']

/**
 * Mount the subagent card over its namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-settings-subagent: copy dictionaries')
  const card = new SubagentCardController(ctx.settingsScope.bind({ namespace: SUBAGENT_NS }))
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: SUBAGENT_NS,
    locale: NS,
    inject: () => card.inject(),
  }, SubagentCard))
}
