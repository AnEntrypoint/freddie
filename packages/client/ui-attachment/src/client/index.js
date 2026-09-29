import { ComposerAttachments } from './ComposerAttachments.js'
import { MessageImages } from './MessageImages.js'

export const inject = ['slots']

export function apply(ctx) {
  ctx.slots.inject('conversation.input.attachments', () => ctx.slots.register({
    name: 'conversation.input.attachments',
    locale: 'conversation',
  }, ComposerAttachments))
  ctx.slots.inject('conversation.message.images', () => ctx.slots.register({
    name: 'conversation.message.images',
    locale: 'conversation',
  }, MessageImages))
}
