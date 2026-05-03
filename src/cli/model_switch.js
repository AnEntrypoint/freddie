import { saveConfigValue, getConfigValue } from '../config.js'
import { normalizeModel } from './model_normalize.js'
import { findInCatalog } from './model_catalog.js'
export function activeModel() { return getConfigValue('agent.model') }
export function switchModel(input) {
    const id = normalizeModel(input)
    const cat = findInCatalog(id)
    saveConfigValue('agent.model', id)
    if (cat?.provider) saveConfigValue('agent.provider', cat.provider)
    return { model: id, provider: cat?.provider, contextLength: cat?.contextLength }
}
