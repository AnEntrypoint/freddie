/**
 * llm domain request/response shapes (names derived from map keys: llmProvidersRequestSchema /
 * llmProvidersValueSchema / llmModelsRequestSchema / llmModelsValueSchema).
 *
 * Schema validation has been removed repo-wide. These were all pure-validation zod schemas
 * (no .transform()/.refine() reshaping) so there is no transform logic to preserve. The
 * exports are kept as plain pass-through objects exposing `.parse(value)` / `.safeParse(value)`
 * that return the value unchanged, because packages/host/apiproxy/src/fetch/client.js and
 * .../fetch/handler.js still look these schemas up BY NAME in shared per-method dispatch maps
 * and call .parse()/.safeParse() on them; updating that repo-wide dispatch mechanism is out of
 * scope for this file (left for the pass that touches client.js/handler.js directly).
 */

const passthrough = () => ({
  parse: (value) => value,
  safeParse: (value) => ({ success: true, data: value }),
})

/** ConfigurableProviderView row of llm.providers. */
export const configurableProviderViewSchema = passthrough()

/** llm.providers request payload. */
export const llmProvidersRequestSchema = passthrough()

/** llm.providers response value. */
export const llmProvidersValueSchema = passthrough()

/** llm.models request payload. */
export const llmModelsRequestSchema = passthrough()

/** llm.models response value. */
export const llmModelsValueSchema = passthrough()

/** DiscoveredModelView row of llm.discoverModels. */
export const discoveredModelViewSchema = passthrough()

/** llm.discoverModels request payload. */
export const llmDiscoverModelsRequestSchema = passthrough()

/** llm.discoverModels response value. */
export const llmDiscoverModelsValueSchema = passthrough()
