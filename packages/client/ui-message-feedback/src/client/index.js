import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import { MessageFeedbackController } from './controller.js'
export { MessageFeedbackActions } from './MessageFeedbackActions.js'
import { en } from './locales.js'

const NS = 'feedback'

export const inject = ['slots', 'remote', 'remote.messageFeedback', 'locale']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-message-feedback: dictionaries')

  const controllers = new Map()
  const controllerFor = (sessionId) => {
    let controller = controllers.get(sessionId)
    if (controller === undefined) {
      controller = new MessageFeedbackController(ctx.remote.messageFeedback, sessionId)
      controllers.set(sessionId, controller)
    }
    return controller
  }

  ctx.on('connection/reset', () => {
    for (const controller of controllers.values()) {
      if (controller.getSnapshot().status !== 'cold') void controller.resync()
    }
  })

  ctx.slots.inject('conversation.chat.assistant-actions', () => {
    const dispose = ctx.slots.register({
      name: 'conversation.chat.assistant-actions',
      id: 'feedback',
      order: 10,
      locale: NS,
      inject: (sessionId) => {
        const controller = controllerFor(sessionId)
        return {
          hooks: { feedback: controller },
          ensure: () => controller.ensure(),
          rate: (messageId, rating, note) => controller.rate(messageId, rating, note),
          toggle: (messageId, rating) => controller.toggle(messageId, rating),
          clearNote: messageId => controller.clearNote(messageId),
          clear: messageId => controller.clear(messageId),
        }
      },
    }, webjsxSlot('freddie-message-feedback-actions'))
    return () => {
      dispose()
      for (const controller of controllers.values()) controller.dispose()
      controllers.clear()
    }
  })
}
