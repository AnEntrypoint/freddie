import { settingsNamespace } from '@freddie/freddie-settings'
import z from '@freddie/schemastery'

export const SUBAGENT_SETTINGS_NAMESPACE = 'subagent'

export const SUBAGENT_NS = settingsNamespace(SUBAGENT_SETTINGS_NAMESPACE)

export const Config = z.object({
  maxDepth: z.number().step(1).min(0).default(3),
  maxActiveSubagents: z.number().step(1).min(1).default(5),
})

export const name = 'client-ui-settings-subagent'

export function apply(ctx, config = {}) {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(SUBAGENT_NS, Config, { base: config })
  })
}
