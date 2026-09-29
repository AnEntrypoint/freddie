import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import { GoalCommandInputView } from './GoalCommandInputView.js'
import { goalCommandInputDefinition } from './goal-command-input.js'
import { en } from './locales.js'

export { GoalBar, GoalDock } from './GoalBar.js'

const NS = 'goal'

export const inject = ['slots', 'sessions', 'remote', 'remote.goals', 'locale', 'conversationEvents']

export function apply(ctx) {
  ctx.conversationEvents.register(goalCommandInputDefinition)
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-goal: dictionaries')

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'command-input',
    locale: NS,
  }, GoalCommandInputView))

  const sessions = ctx.sessions

  const refOf = (sessionId) => {
    const face = sessions.binding(sessionId)?.session.projections.faceOf('goal')
    const projection = face?.getSnapshot()
    if (projection == null) return undefined
    return { id: projection.goal.id, revision: projection.goal.revision }
  }

  const noCurrentGoal = {
    ok: false,
    error: { code: 'no-current-goal', message: 'no current goal to mutate', details: {} },
  }

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'goal',
    order: 10,
    locale: NS,
    inject: (sessionId) => ({
      onEdit: async (objective) => {
        const ref = refOf(sessionId)
        if (ref === undefined) return noCurrentGoal
        return await ctx.remote.goals.edit(sessionId, ref, { objective })
      },
      onPause: async () => {
        const ref = refOf(sessionId)
        if (ref === undefined) return noCurrentGoal
        return await ctx.remote.goals.pause(sessionId, ref)
      },
      onResume: async () => {
        const ref = refOf(sessionId)
        if (ref === undefined) return noCurrentGoal
        return await ctx.remote.goals.resume(sessionId, ref)
      },
      onClear: async () => {
        const ref = refOf(sessionId)
        if (ref === undefined) return noCurrentGoal
        return await ctx.remote.goals.clear(sessionId, ref)
      },
    }),
  }, webjsxSlot('freddie-goal-dock')))
}
