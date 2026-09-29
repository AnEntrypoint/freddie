import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import { InputTriggerService } from './service.js'
import './MenuView.js'
import { en } from './locales.js'

export { InputTriggerService } from './service.js'
export { InputTriggerController } from './controller.js'

const MENU_NS = 'slash.menu'

export const inject = ['sessions', 'locale']

export function apply(ctx) {
  ctx.plugin(InputTriggerService)
  ctx.effect(() => ctx.locale.register(MENU_NS, { en }), 'ui-input-trigger: menu dictionaries')
  ctx.inject(['slots', 'inputTriggers', 'sessions'], (scope) => {
    const inputTriggers = scope.inputTriggers
    const sessions = scope.sessions
    scope.slots.inject('conversation.input.overlay', () => scope.slots.register({
      name: 'conversation.input.overlay',
      id: 'slash-menu',
      order: 0,
      locale: MENU_NS,
      inject: (sessionId) => {
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
