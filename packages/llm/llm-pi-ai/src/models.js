import { builtinModels } from '@earendil-works/pi-ai/providers/all'
import { THINKING_LEVELS } from './catalog.js'

export function createModels(options) {
  const models = builtinModels(options)
  models.clearProviders()
  return models
}

export function createProvider(input) {
  return {
    id: input.id,
    name: input.name,
    ...input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl },
    auth: input.auth,
    getModels: () => input.models,
    stream: (model, context, options) => input.api.stream(model, context, options),
    streamSimple: (model, context, options) => input.api.streamSimple(model, context, options),
  }
}

export function getSupportedThinkingLevels(model) {
  if (!model.reasoning) return ['off']
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level]
    if (mapped === null) return false
    if (level === 'xhigh' || level === 'max') return mapped !== undefined
    return true
  })
}
