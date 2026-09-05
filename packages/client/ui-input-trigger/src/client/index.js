/**
 * Slash trigger plugin, browser half: the InputTriggerService (`ctx.inputTriggers`) owning
 * trigger detection, the candidate menu, and the pick pipeline; MenuView
 * self-registers into the conversation.input.overlay slot. Frozen pipeline
 * contract in ./contract.js; sources register through ctx.inputTriggers alone.
 */
import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import { InputTriggerService } from './service.js'
import './MenuView.js'
import { en, zh } from './locales.js'

export { InputTriggerService } from './service.js'
export { InputTriggerController } from './controller.js'

/** Namespace owning the candidate-menu copy. */
const MENU_NS = 'slash.menu'

/** Required services: controller resolution reads the session scope tree; the menu copy is localized. */
export const inject = ['sessions', 'locale']

/**
 * Client plugin body: mount the service, then register MenuView into the
 * input overlay once its declarer is up.
 * @param ctx - client root context.
 */
export function apply(ctx) {
  ctx.plugin(InputTriggerService)
  ctx.effect(() => ctx.locale.register(MENU_NS, { zh, en }), 'ui-input-trigger: menu dictionaries')
  ctx.inject(['slots', 'inputTriggers', 'sessions'], (scope) => {
    const inputTriggers = scope.inputTriggers
    const sessions = scope.sessions
    scope.slots.inject('conversation.input.overlay', () => scope.slots.register({
      name: 'conversation.input.overlay',
      id: 'slash-menu',
      order: 0,
      locale: MENU_NS,
      inject: (sessionId) => {
        // Session-scoped slot: resolve this session's controller (the slot
        // frame hands ids, not ctx — the registered id→ctx interchange).
        const actx = sessions.scope(sessionId)
        if (actx === undefined) throw new Error(`ui-input-trigger: session "${String(sessionId)}" resolved no scope`)
        const controller = inputTriggers.sessionOf(actx)
        return {
          menu: controller.menu,
          onPick: (source, index) => { controller.pick(source, index) },
          onDismiss: () => { controller.dismiss() },
        }
      },
    }, webjsxSlot('freddie-menu-view')))
  })
}
