/** Shared projection of the live LLM registry into the browser model catalog. */

/**
 * Build the browser model catalog without requiring a Session.
 * @param {import('@freddie/cordis').Context} ctx - Host context carrying the live LLM registry.
 * @param {import('./types.js').ModelSelection} [defaultSelection] - deployment default
 *   used before a Session selects a model.
 * @returns {Promise<import('./types.js').ModelCatalog>} successful non-empty provider
 *   groups and isolated provider failures.
 */
export async function buildModelCatalog(ctx, defaultSelection = ctx.agentDefaultModel.currentSelection()) {
  const providers = ctx.llm.listProviders()
  const catalog = await Promise.all(providers.map(async (provider) => {
    try {
      const models = await ctx.llm.listModels(provider.id)
      const entries = await Promise.all(models.map(async (model) => {
        const resolved = await ctx.llm.resolveModelInfo(provider.id, model.id)
        const reasoning = resolved.reasoning === undefined
          ? undefined
          : {
            efforts: resolved.reasoning.efforts.map(effort => ({
              id: effort.id,
              name: effort.name,
              ...(effort.description === undefined ? {} : { description: effort.description }),
            })),
            ...(resolved.reasoning.defaultEffort === undefined
              ? {}
              : { defaultEffort: resolved.reasoning.defaultEffort }),
          }
        return {
          id: model.id,
          name: model.name,
          ...(model.description === undefined ? {} : { description: model.description }),
          ...(reasoning === undefined ? {} : { reasoning }),
        }
      }))
      return { kind: 'group', group: { id: provider.id, name: provider.name, models: entries } }
    } catch (error) {
      return {
        kind: 'failure',
        failure: {
          id: provider.id,
          name: provider.name,
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }))
  const groups = catalog.flatMap(item => item.kind === 'group' ? [item.group] : [])
    .filter(group => group.models.length > 0)
  return {
    default: { ...defaultSelection },
    routableProviders: groups.map(group => group.id),
    groups,
    failures: catalog.flatMap(item => item.kind === 'failure' ? [item.failure] : []),
  }
}
