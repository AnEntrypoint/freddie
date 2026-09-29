const PACKAGE_NAME = '@freddie/freddie-authorization'

export const name = 'authorization-invariant'
export const inject = ['invariants']

const install = (ctx, fail) => {
  ctx.on('authorization/settled', (key) => {
    const authorization = ctx.get('authorization')
    if (authorization === undefined) {
      fail(`authorization/settled for "${key}" emitted without a live authorization service`)
      return
    }
    const keyStillHeld = authorization.describe(key)?.inFlight === true
    if (keyStillHeld) {
      fail(`authorization/settled for "${key}" left the key in flight, wedging every later attempt`)
    }
  })
}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
