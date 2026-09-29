const PACKAGE_NAME = '@freddie/freddie-plan-mode'

export const name = 'plan-mode-invariant'
export const inject = ['invariants']

function validateEvent(event, fail) {
  if (event.type !== 'plan/mode') return
  const active = event.data.active
  if (typeof active !== 'boolean') {
    fail(`plan/mode carries invalid active state ${JSON.stringify(active)}; expected a boolean`)
  }
}

const install = Object.assign((ctx, fail) => {
  const seed = (session) => {
    for (const event of session.events) validateEvent(event, fail)
  }
  for (const session of ctx.sessions.list()) seed(session)
  ctx.on('session/created', (session) => { seed(session) }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [, event] = args
    validateEvent(event, fail)
  }, { global: true })
}, { inject: ['sessions'] })

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
