import { canExecute, hasLinuxChooserBinary } from './probe.js'
import { resolveDirectoryPickerBackend } from './resolve.js'

export { canExecute, hasLinuxChooserBinary } from './probe.js'
export { resolveDirectoryPickerBackend } from './resolve.js'

export const name = 'directory-picker-auto'
export const inject = ['webServer', 'loader']

export const BACKEND_PACKAGES = {
  native: '@freddie/freddie-host-directory-picker-native',
  browse: '@freddie/freddie-host-directory-picker-browse',
}

export const SURFACE_PACKAGES = {
  native: '@freddie/freddie-client-ui-directory-picker-native',
  browse: '@freddie/freddie-client-ui-directory-picker-browse',
}

export async function apply(ctx) {
  const backend = resolveDirectoryPickerBackend({
    bindHost: ctx.webServer.host,
    platform: process.platform,
    env: process.env,
    linuxChooser: hasLinuxChooserBinary(process.env.PATH, canExecute),
  })
  await ctx.effect(async () => {
    const ids = []
    const unmount = async () => {
      for (const id of [...ids].reverse()) {
        if (ctx.loader.store[id] === undefined) continue
        await ctx.loader.remove(id)
      }
    }
    try {
      for (const name of [BACKEND_PACKAGES[backend], SURFACE_PACKAGES[backend]]) {
        ids.push(await ctx.loader.create({ name }))
      }
    } catch (cause) {
      await unmount()
      throw cause
    }
    return unmount
  }, 'directory-picker-auto: interaction entries')
}
