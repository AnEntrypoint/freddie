import z from '@freddie/schemastery'

export const Config = z.object({
  mountedRowBudget: z.number().step(1).min(40).default(120),
})

export { apply, inject } from './apply.js'
export { ConversationController } from './service.js'
