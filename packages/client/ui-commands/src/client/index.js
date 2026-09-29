import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import { CommandUiRuntime } from './service.js'
import { en } from './locales.js'

export { CommandUiRuntime } from './service.js'
export { CommandDirectory } from './directory.js'
export { filterOptions, PopupSelectController } from './popup.js'
export { FreddiePopupSelectView } from './PopupSelectView.js'

const NS = 'command'

export const inject = ['inputTriggers', 'sessions', 'remote', 'remote.commands', 'locale']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-commands: dictionaries')
  ctx.plugin(CommandUiRuntime)
  ctx.inject(['slots', 'commandUi', 'sessions'], (scope) => {
    const command = scope.commandUi
    const sessions = scope.sessions
    scope.slots.inject('conversation.input.overlay', () => scope.slots.register({
      name: 'conversation.input.overlay',
      id: 'command-popup',
      order: 1,
      locale: NS,
      inject: (sessionId) => {
        const actx = sessions.scope(sessionId)
        if (actx === undefined) throw new Error(`ui-commands: session "${String(sessionId)}" resolved no scope`)
        return { popup: command.popupFor(actx) }
      },
    }, webjsxSlot('freddie-popup-select-view')))
  })
}
