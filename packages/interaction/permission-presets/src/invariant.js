const PACKAGE_NAME = '@freddie/freddie-permission-presets'

export const name = 'permission-presets-invariant'
export const inject = ['invariants']

function validateEvent(ctx, event, fail) {
  if (event.type === 'permission/preset' && !ctx.permissionPresets.names.includes(event.data.preset)) {
    fail(`permission/preset names unknown preset ${JSON.stringify(event.data.preset)}`)
  }
}

const install = Object.assign((ctx, fail) => {
  for (const session of ctx.sessions.list()) {
    for (const event of session.events) validateEvent(ctx, event, fail)
  }
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const event = args[1]
    validateEvent(ctx, event, fail)
  }, { global: true })
}, { inject: ['permissionPresets', 'sessions'] })

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
