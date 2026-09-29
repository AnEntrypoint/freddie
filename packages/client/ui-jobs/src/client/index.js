import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './JobListAction.js'
import { en, NS } from './locales.js'

export const inject = ['sessions', 'slots', 'locale']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-job: dictionaries')
  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'job-list',
      order: 20,
      locale: NS,
    }, webjsxSlot('freddie-job-list-action')),
  )
}
