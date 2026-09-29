import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './QuestionComposer.js'
import { en } from './locales.js'

export { PendingQuestion } from './contract/slots.js'

const NS = 'question'

export const inject = ['slots', 'locale']

function selectQuestion({ interactions }) {
  return interactions.find((i) => i.kind === 'question') ?? null
}

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-user-questions: dictionaries')

  ctx.slots.inject('conversation.composer', () => ctx.slots.register(
    { name: 'conversation.composer', select: selectQuestion, locale: NS },
    webjsxSlot('freddie-question-composer'),
  ))
}
