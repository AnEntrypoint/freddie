import { listCatalog, findInCatalog } from './model_catalog.js'
import { switchModel, activeModel } from './model_switch.js'
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
