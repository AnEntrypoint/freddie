import z from '@freddie/schemastery'

import { PERSONA_ORDER, PERSONA_SECTION } from '@freddie/freddie-system-prompt'

export { PERSONA_ORDER, PERSONA_SECTION }

export const name = 'persona'

export const inject = ['systemPrompt']

export const Config = z.object({
  text: z.string().required(),
  complete: z.boolean().default(false),
  includeRuntimeContext: z.boolean().default(true),
})

export function apply(ctx, config) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: PERSONA_SECTION,
    order: PERSONA_ORDER,
    text: config.text,
    ...(config.complete ? { complete: true } : {}),
  }), 'persona.section()')
  if (!(config.includeRuntimeContext ?? true)) ctx.systemPrompt.suppressRuntimeContext()
}
