import { SubagentCard } from './SubagentCard.js'
import { SUBAGENT_NS, SubagentCardController } from './subagent-card-controller.js'
import { en } from './locales.js'

const NS = 'settings.subagent'

export const inject = ['slots', 'locale', 'settingsScope']

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
