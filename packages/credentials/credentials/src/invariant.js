const PACKAGE_NAME = '@freddie/freddie-credentials'

export const name = 'credentials-invariant'
export const inject = ['invariants']

const install = (ctx, fail) => {
  ctx.on('credentials/reference-updated', (ref) => {
    if (ctx.get('credentials') === undefined) {
      fail(`credentials/reference-updated for "${ref}" emitted without a live credentials service`)
    }
  })
}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
