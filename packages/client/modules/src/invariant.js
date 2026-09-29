/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-client-modules'

export const name = 'client-modules-invariant'
export const inject = ['invariants']

const install = (ctx, fail) => {
  ctx.on('internal/plugin', () => {
    const host = ctx.get('clientModules')
    if (host === undefined) return
    for (const row of host.graph().entries) {
      if (host.clientPath(row.id) === undefined) {
        fail(`web plugin graph row "${row.id}" advertises ${row.url} but resolves no client bundle path — the served __FREDDIE_BOOT__ would 404 on fetch`)
      }
    }
  }, { global: true })
}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
