import { applyTeamEvent, foldTeam, isTeamEvent } from './fold.js'

const PACKAGE_NAME = '@freddie/freddie-experimental-agent-team'

export const name = 'team-invariant'
export const inject = ['invariants']

const install = Object.assign((ctx, fail) => {
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args
    if (!isTeamEvent(event)) return
    try {
      const state = foldTeam(session.id, session.events)
      applyTeamEvent(state, event)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      fail(`session event ${event.seq} violates the Agent Teams stream: ${message}`)
    }
  }, { global: true })
}, { inject: ['sessions'] })

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
