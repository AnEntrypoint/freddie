import { isDeepStrictEqual } from 'node:util'
import { foldGoal } from '@freddie/freddie-goal'
import { renderGoalRoundPrompt } from './prompt.js'

const PACKAGE_NAME = '@freddie/freddie-goal-round-driver'

export const name = 'goal-round-driver-invariant'
export const inject = ['invariants']

function foldChecked(events, fail) {
  try {
    return foldGoal(events)
  } catch (error) {
    /* v8 ignore next -- the strict goal decoder throws Error instances */
    const message = error instanceof Error ? error.message : String(error)
    return fail(`cannot reconstruct the goal before a continuation message: ${message}`)
  }
}

function goalView(folded, source, fail) {
  const goal = folded.goal
  if (goal === undefined || folded.createdAt === undefined || folded.updatedAt === undefined
    || goal.phase !== 'active' || goal.id !== source.goalId || goal.revision !== source.revision
    || source.round !== folded.roundsStarted + 1 || source.round > goal.maxGoalRounds) {
    return fail(`goal round ${source.round} cannot be reconstructed from the preceding durable goal state`)
  }
  return {
    ...goal,
    roundsStarted: folded.roundsStarted,
    createdAt: folded.createdAt,
    updatedAt: folded.updatedAt,
    activation: 'armed',
  }
}

function validateEvent(prior, event, fail) {
  if (event.type !== 'user/message') return
  const source = event.data.source
  if (source.kind !== 'goal' || source.round <= 0) return
  const expected = renderGoalRoundPrompt(goalView(foldChecked(prior, fail), source, fail), source.round)
  if (!isDeepStrictEqual(event.data.content, expected)) {
    fail(`goal round ${source.round} content does not match the package-owned continuation prompt`)
  }
}

const install = Object.assign((ctx, fail) => {
  for (const session of ctx.sessions.list()) {
    const prior = []
    for (const event of session.events) {
      validateEvent(prior, event, fail)
      prior.push(event)
    }
  }
  /* jscpd:ignore-start -- package companions share dispatch and registration plumbing */
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args
    validateEvent(session.events, event, fail)
  }, { global: true })
}, { inject: ['sessions'] })

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
