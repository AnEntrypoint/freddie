import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
export { PlanChip } from './PlanModeControl.js'
import { en } from './locales.js'

const NS = 'plan'

export const inject = ['slots', 'remote', 'remote.commands', 'locale']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en }), 'ui-plan: dictionaries')

  ctx.slots.inject('conversation.input.plan', () => ctx.slots.register({
    name: 'conversation.input.plan',
    locale: NS,
    inject: (sessionId) => ({
      exitPlanMode: async () => {
        const result = await ctx.remote.commands.execute(sessionId, '/plan off', [])
        if (!result.ok) return `${result.error.message} (${result.error.code})`
        if (result.value === undefined) return 'unknown command: /plan off'
        return null
      },
    }),
  }, webjsxSlot('freddie-plan-chip')))
}
