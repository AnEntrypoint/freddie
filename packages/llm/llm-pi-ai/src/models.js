/** pi-ai model helpers assembled from public narrow entry points.
 * @module @freddie/freddie-llm-pi-ai/models
 */

import { builtinModels } from '@earendil-works/pi-ai/providers/all'
import { THINKING_LEVELS } from './catalog.js'

/**
 * Input accepted by the static, single-protocol providers this package builds.
 * @typedef {object} StaticProviderOptions
 * @property {string} id
 * @property {string} name
 * @property {string} [baseUrl]
 * @property {object} auth
 * @property {readonly object[]} models
 * @property {object} api Provider stream implementation.
 */

/**
 * Create an empty pi-ai collection without importing its aggregate entry point.
 * @param {object} [options] - credential storage and ambient authentication integrations.
 * @returns {object} a mutable collection with no registered providers.
 */
export function createModels(options) {
  const models = builtinModels(options)
  models.clearProviders()
  return models
}

/**
 * Create the static, single-protocol provider used by configured custom routes.
 * @param {StaticProviderOptions} input - provider identity, models, authentication, and protocol implementation.
 * @returns {object} a provider that delegates each operation to the supplied protocol.
 */
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

/**
 * Resolve selectable reasoning levels from pi-ai's public model metadata.
 * @param {object} model - model descriptor carrying reasoning support and wire mappings.
 * @returns {string[]} supported levels in pi-ai's escalation order.
 */
export function getSupportedThinkingLevels(model) {
  if (!model.reasoning) return ['off']
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level]
    if (mapped === null) return false
    if (level === 'xhigh' || level === 'max') return mapped !== undefined
    return true
  })
}
