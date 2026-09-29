/* jscpd:ignore-start */
const PACKAGE_NAME = '@freddie/freddie-host-webserver'

export const name = 'host-webserver-invariant'
export const inject = ['invariants']

const install = (ctx, fail) => {
  ctx.on('internal/plugin', () => {
    const server = ctx.get('webServer')
    if (server === undefined) return
    const probe = { kind: 'exact', path: '/__dsh_invariant_probe__', handler: () => {} }
    try {
      server.register(probe)()
      server.register(probe)()
      const upgradeProbe = { path: '/__dsh_invariant_upgrade_probe__', handler: () => {} }
      server.registerUpgrade(upgradeProbe)()
      server.registerUpgrade(upgradeProbe)()
    } catch {
      fail('webServer route disposer left a route registered — route tables and fiber lifecycles diverged')
    }
  }, { global: true })
}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
