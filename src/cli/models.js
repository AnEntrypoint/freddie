// Thin CLI command file: argument dispatch + output shaping only. All actual
// model logic (catalog data, normalization, discovery) lives in ../models/.
//
// switchModel/activeModel stay here rather than in src/models/ -- they are
// CLI-facing config mutations (saveConfigValue('agent.model', ...)), not pure
// model-domain logic, so they belong with the command that invokes them.
import { listCatalog, findInCatalog } from '../models/catalog.js'
import { normalizeModel } from '../models/normalize.js'
import { saveConfigValue, getConfigValue } from '../config.js'

export function activeModel() { return getConfigValue('agent.model') }

export function switchModel(input) {
    const id = normalizeModel(input)
    const cat = findInCatalog(id)
    saveConfigValue('agent.model', id)
    if (cat?.provider) saveConfigValue('agent.provider', cat.provider)
    return { model: id, provider: cat?.provider, contextLength: cat?.contextLength }
}

export const ACTIONS = {
    list: ({ provider }) => ({ models: listCatalog({ provider }) }),
    get: ({ id }) => ({ model: findInCatalog(id) }),
    use: ({ id }) => switchModel(id),
    active: () => ({ active: activeModel() }),
}

export async function modelsSubcommand(action = 'list', args = {}) {
    const fn = ACTIONS[action]
    if (!fn) return { error: 'unknown action: ' + action, valid: Object.keys(ACTIONS) }
    return fn(args)
}
