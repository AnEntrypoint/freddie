import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import {
  SubagentReadOnlyComposer,
} from './SubagentReadOnlyComposer.js'
import { en, NS } from './locales.js'

export const inject = ['sessions', 'slots', 'locale']

function selectReadOnlySubagent(owner) {
  const subagent = owner.session?.subagent
  if (subagent === undefined || subagent === null) return null
  if (subagent.address.mode === 'one-shot') return { reason: 'one-shot' }
  if (subagent.parentAvailable) return null
  const runningChildKeepsDefaultComposerForStop = owner.session?.running === true
  return runningChildKeepsDefaultComposerForStop ? null : { reason: 'parent-unavailable' }
}

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-subagent: dictionaries')
  const sessions = ctx.sessions
  const catalogActions = (_parentSessionId) => ({
    openChild(address) {
      sessions.openSubagent(address)
    },
    refresh(parentSessionId) {
      void sessions.refreshSubagents(parentSessionId)
    },
    setCatalogOpen(parentSessionId, open) {
      sessions.setSubagentCatalogOpen(parentSessionId, open)
    },
  })
  ctx.slots.inject(
    'conversation.session.header.lineage',
    () => ctx.slots.register({
      name: 'conversation.session.header.lineage',
      locale: NS,
      inject: catalogActions,
    }, webjsxSlot('freddie-subagent-header-lineage')),
  )
  ctx.slots.inject(
    'conversation.composer',
    () => ctx.slots.register({
      name: 'conversation.composer',
      priority: -10,
      locale: NS,
      select: selectReadOnlySubagent,
    }, SubagentReadOnlyComposer),
  )
}
