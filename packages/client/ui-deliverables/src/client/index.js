import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import { en, NS } from './locales.js'
import {
  deliverablesDefinition, producedFileMentions, selectProducedFiles,
} from './turn-deliverables.js'

export { FreddieProducedFiles, fitProducedFiles } from './ProducedFiles.js'
export { producedForClosing } from './turn-deliverables.js'

export const inject = ['slots', 'locale', 'conversationEvents', 'connection']

export function apply(ctx) {
  const connection = ctx.get('connection')
  ctx.conversationEvents.register(deliverablesDefinition)
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-deliverables: dictionaries')
  ctx.slots.inject(
    'conversation.chat.turnTail',
    () => ctx.slots.register({
      name: 'conversation.chat.turnTail',
      select: selectProducedFiles,
      locale: NS,
      inject: () => ({
        isLoopback: connection.isLoopback,
        hooks: { hostDescription: connection.hostDescription },
      }),
    }, webjsxSlot('freddie-produced-files')),
  )
  const t = ctx.locale.bind(NS)
  const mentionsCache = new WeakMap()
  const mentions = {
    forClosing(owner) {
      const paths = selectProducedFiles(owner)
      if (paths === null) return undefined
      const key = paths.join(' ')
      const cached = mentionsCache.get(owner.turn)
      if (cached !== undefined && cached.key === key
        && cached.seq === owner.seq && cached.openFile === owner.openFile) {
        return cached.value
      }
      const value = producedFileMentions(paths, owner.openFile, path => t('produced.open', { name: path }))
      mentionsCache.set(owner.turn, { key, seq: owner.seq, openFile: owner.openFile, value })
      return value
    },
  }
  ctx.provide('chatFileMentions', mentions)
}
