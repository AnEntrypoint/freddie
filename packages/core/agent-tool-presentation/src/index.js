import z from '@freddie/schemastery'

export const name = 'tool-presentation'

export const inject = ['tools']

export const Config = z.object({
  mode: z.union(['native', 'code', 'both']).required(),
})

export function apply(ctx, config) {
  if (config.mode === 'native') {
    ctx.tools.presentAs('native')
    return
  }
  ctx.inject(['codeRuntime'], (runtimeCtx) => {
    runtimeCtx.tools.presentAs(config.mode)
  })
}
