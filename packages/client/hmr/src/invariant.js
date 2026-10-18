import { leftoverHandles } from './handles.js'

const PACKAGE_NAME = '@freddie/freddie-client-hmr'

export const name = 'client-hmr-invariant'
export const inject = ['invariants']

const install = (ctx, fail) => {
  ctx.on('internal/plugin', async (fiber) => {
    if (fiber.name !== 'client-hmr' || fiber.uid !== null) return
    await Promise.resolve()
    await fiber.await()
    await new Promise((resolve) => { setImmediate(resolve) })
    const { watchers, timers } = leftoverHandles(fiber)
    if (watchers > 0 || timers > 0) {
      fail(`client-hmr fiber disposed but ${watchers} fs.watch watcher(s) and ${timers} interval timer(s) it opened survived teardown`)
    }
  }, { global: true })
}

export const apply = (ctx) =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
