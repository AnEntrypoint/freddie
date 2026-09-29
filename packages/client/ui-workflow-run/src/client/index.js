import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import { en, NS } from './locales.js'
import { workflowRunDefinition } from './workflow-definition.js'

export const inject = ['conversationEvents', 'slots', 'sessions', 'locale']

export function apply(ctx) {
  ctx.conversationEvents.register(workflowRunDefinition)
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-workflow-run: dictionaries')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'workflow-run',
    locale: NS,
    inject: () => ({
      openSession: (id) => { ctx.sessions.open(id) },
    }),
  }, webjsxSlot('freddie-workflow-run-panel')))
}
