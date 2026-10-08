import { foldScheduleEvents, ScheduleLogError } from './domain.js'

const PACKAGE_NAME = '@freddie/freddie-schedule'

export const name = 'tool-schedule-invariant'
export const inject = ['invariants']

function validate(events, seedLength, fail) {
  try {
    foldScheduleEvents(events, seedLength)
  } catch (error) {
    if (!(error instanceof ScheduleLogError)) throw error
    fail(error.message)
  }
}

const install = Object.assign((ctx, fail) => {
  for (const session of ctx.sessions.list()) {
    validate(session.events, session.header.seedLength ?? 0, fail)
  }
  ctx.on('session/created', (session) => {
    validate(session.events, session.header.seedLength ?? 0, fail)
  }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args
    if (event.type !== 'schedule/change') return
    validate([...session.events, event], session.header.seedLength ?? 0, fail)
  }, { global: true })
}, { inject: ['sessions'] })

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
