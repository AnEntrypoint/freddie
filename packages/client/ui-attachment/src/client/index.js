import { functionSlot } from '@freddie/freddie-client-ui-slots'
import { ComposerAttachments } from './ComposerAttachments.js'
import { MessageImages } from './MessageImages.js'

export const inject = ['slots']

export function apply(ctx) {
  ctx.slots.inject('conversation.input.attachments', () => ctx.slots.register({
    name: 'conversation.input.attachments',
    locale: 'conversation',
  }, functionSlot(ComposerAttachments, { subscriptions: 'reads' })))
  ctx.slots.inject('conversation.message.images', () => ctx.slots.register({
    name: 'conversation.message.images',
    locale: 'conversation',
  }, functionSlot(MessageImages, { subscriptions: 'reads' })))
}
