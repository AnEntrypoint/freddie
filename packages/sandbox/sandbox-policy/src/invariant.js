import { SANDBOX_MODES } from './session-mode.js'

const PACKAGE_NAME = '@freddie/freddie-sandbox-policy'

export const name = 'sandbox-policy-invariant'
export const inject = ['invariants']

function validateEvent(event, fail) {
  if (event.type === 'sandbox/mode' && !SANDBOX_MODES.includes(event.data.mode)) {
    fail(`sandbox/mode carries unknown mode ${JSON.stringify(event.data.mode)}`)
  }
}

const install = Object.assign((ctx, fail) => {
  for (const session of ctx.sessions.list()) {
    for (const event of session.events) validateEvent(event, fail)
  }
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const event = args[1]
    validateEvent(event, fail)
  }, { global: true })
}, { inject: ['sessions'] })

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
