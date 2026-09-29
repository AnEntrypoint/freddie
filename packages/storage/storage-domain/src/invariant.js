const PACKAGE_NAME = '@freddie/freddie-storage-domain'

export const name = 'storage-domain-invariant'
export const inject = ['invariants']

const install = Object.assign((ctx, fail) => {
  ctx.on('domain/changed', (change) => {
    const domain = ctx.storage.form('domain').get(change.domain)
    if (domain === undefined) {
      return fail(`domain/changed for '${change.domain}' emitted while that domain is not open`)
    }
    if (change.table === '') {
      if (domain.global.get() !== change.value) {
        return fail(`domain/changed global value for '${change.domain}' differs from the in-memory global`)
      }
      return
    }
    const current = domain.table(change.table).get(change.key)
    switch (change.operation) {
      case 'deleted':
        if (current !== undefined) {
          return fail(
            `domain/changed deletion of '${change.domain}'.'${change.table}'['${change.key}'] `
            + 'emitted while the record is still in memory',
          )
        }
        return
      case 'put':
        if (current !== change.value) {
          return fail(
            `domain/changed value for '${change.domain}'.'${change.table}'['${change.key}'] `
            + 'differs from the in-memory record',
          )
        }
        return
      default:
        return
    }
  }, { global: true })
}, { inject: ['storage'] })

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
