import z from '@freddie/schemastery'
import { FxEngine } from './engine.js'
import { toFxProvider } from './provider.js'

export { FxEngine, splitPrompt } from './engine.js'
export { toFxProvider } from './provider.js'
export { toFxTools } from './tools.js'

export const name = 'agent-fx'
export const inject = ['credentials', 'fxAgent']

export const Config = z.object({
  providers: z.array(z.object({
    name: z.string().required(),
    baseUrl: z.string().required(),
    protocol: z.union(['openai-chat-completions', 'anthropic-messages']).default('openai-chat-completions'),
    models: z.array(z.string()),
    credentialRef: z.string(),
  })).default([]),
})

export function apply(ctx, config) {
  const routes = new Map(config.providers.map(route => [route.name, route]))
  const providerFor = (provider) => {
    const route = routes.get(provider)
    if (route === undefined) throw new Error(`agent-fx: provider "${provider}" has no route in the plugin config`)
    return toFxProvider(route, ref => ctx.credentials.resolve(ref))
  }
  ctx.provide('agentEngine', new FxEngine({ createAgent: options => ctx.fxAgent.agent(options), providerFor }))
}
