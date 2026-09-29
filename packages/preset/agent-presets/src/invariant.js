import { leakedServices, livePresetMounts } from '@freddie/freddie-agent-presets'

const PACKAGE_NAME = '@freddie/freddie-agent-presets'

export const name = 'agent-presets-invariant'
export const inject = ['invariants']

const install = (ctx, fail) => {
  ctx.on('internal/service', function (name) {
    for (const mount of livePresetMounts()) {
      const leaked = leakedServices(ctx, mount.fiber)
      if (leaked.length === 0) continue
      fail(
        `preset "${mount.presetId}" published process-global service(s) [${leaked.join(', ')}] `
        + `after its mount was audited (observed while notifying "${name}") — `
        + 'a preset service must sit behind an `isolate` realm or move to the host composition',
      )
    }
  }, { global: true })

  ctx.on('system-prompt/assemble', (_assembly, context, next) => {
    const presets = ctx.get('agentPresets')
    const agent = context.agent
    if (presets !== undefined && presets.roots.length > 0
      && agent !== undefined && presets.composedPreset(agent.ctx) === undefined) {
      fail(
        `agent "${agent.id}" addressed a model without joining any agent preset while a roster is `
        + 'composed; its tools, prompt sections, and skill catalog resolve against the empty global layer',
      )
    }
    return next()
  })
}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
