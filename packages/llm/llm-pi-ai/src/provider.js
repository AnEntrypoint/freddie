/**
 * Construction of the pi-ai `Provider` that one configured route registers into
 * the adapter's `Models` collection.
 *
 * Two constructions, one decision: a route the installed catalog ships, whose
 * profile does not override the wire protocol, **reuses that catalog provider**
 * with its models replaced — the catalog provider owns API implementations this
 * package cannot reconstruct (Bedrock loads its Smithy module through a
 * separate entry point), so rebuilding it from parts would silently narrow
 * which providers work. Every other route is built by `createProvider` over the
 * protocol table below.
 *
 * Credentials never reach this module's storage: the harness resolves a route's
 * key through `ctx.credentials` before the request enters pi-ai and hands it
 * over as a stream option.
 * @module @freddie/freddie-llm-pi-ai/provider
 */

import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import { catalogProvider, PiAiCatalogError } from './catalog.js'
import { createProvider } from './models.js'

/**
 * Wire protocols a configured route may name, mapped to pi-ai's lazily loaded
 * implementations.
 *
 * The table is deliberately narrow: the protocols a hand-declared route
 * actually reads, each completely describable with a key, an endpoint, and
 * headers. Bedrock signs with SigV4, Vertex needs a project and a location,
 * Azure needs provider environment plus an api-version, and Codex
 * authenticates through OAuth — none of which this configuration shape can
 * express. Catalog routes still reach every protocol through their own
 * provider; only an explicit override is refused.
 */
const PROTOCOLS = {
  'openai-completions': openAICompletionsApi,
  'openai-responses': openAIResponsesApi,
  'anthropic-messages': anthropicMessagesApi,
}

/**
 * Every wire protocol a configured route may name, most-reached first. The
 * order is the table's and therefore stable; a configuration surface offering a
 * choice presents the first as its default.
 * @returns {readonly string[]} the supported protocol identifiers.
 */
export function supportedProtocols() {
  return Object.keys(PROTOCOLS)
}

/**
 * Api-key auth for a route the harness authenticates itself. `Models` calls
 * this after the adapter has already resolved the route's credential, so a
 * missing key here is not this layer's failure: a named-but-unresolvable
 * reference has already failed the request with `MISSING_CREDENTIAL`, and a
 * route naming no credential at all is deliberately unauthenticated. Reporting
 * it as configured hands the decision to the protocol, which is where the
 * requirement actually lives.
 * @param {string} name - display name used as the resolution's status label.
 * @returns {object} the api-key auth for a harness-authenticated route.
 */
function harnessApiKeyAuth(name) {
  return {
    name,
    resolve: ({ credential }) => Promise.resolve({
      auth: credential?.key === undefined ? {} : { apiKey: credential.key },
      source: name,
    }),
  }
}

/**
 * The resolved route facts provider construction reads.
 * @typedef {object} ProviderSpec
 * @property {string} provider Provider route key; also the `Models` collection key.
 * @property {string} displayName Display name for selectors and status labels.
 * @property {string} [api] Wire protocol override.
 * @property {string} [baseURL] Endpoint override.
 * @property {readonly object[]} models The route's materialized models.
 * @property {boolean} namesCredential Whether the profile names a credential.
 */

/**
 * The auth one route resolves its credential through.
 *
 * A catalog route keeps the installed provider's own auth, which is what
 * preserves provider-native ambient discovery. The single addition covers a
 * catalog provider that offers no api-key method at all: pi-ai honors a
 * request's `apiKey` override only when the provider declares one, so an
 * OAuth-only provider would refuse a profile's explicit key with
 * `Provider is not configured` before any request went out.
 * @param {ProviderSpec} spec - the resolved route facts.
 * @param {object | undefined} catalog - the installed catalog provider, when pi-ai ships one.
 * @returns {object} the auth to construct this route's provider with.
 */
function routeAuth(spec, catalog) {
  if (catalog === undefined) return { apiKey: harnessApiKeyAuth(spec.displayName) }
  if (catalog.auth.apiKey !== undefined || !spec.namesCredential) return catalog.auth
  return { ...catalog.auth, apiKey: harnessApiKeyAuth(spec.displayName) }
}

/**
 * Reuse an installed catalog provider with this route's models and identity.
 * Catalog-owned dynamic refresh is dropped: this route's catalog is the
 * settings document, and a background refresh would contradict it.
 * @param {object} base - the installed catalog provider.
 * @param {ProviderSpec} spec - the resolved route facts.
 * @returns {object} the reused provider.
 */
function reuseCatalogProvider(base, spec) {
  const baseUrl = spec.baseURL ?? base.baseUrl
  return {
    id: spec.provider,
    name: spec.displayName,
    ...baseUrl === undefined ? {} : { baseUrl },
    auth: routeAuth(spec, base),
    getModels: () => spec.models,
    stream: (model, context, options) => base.stream(model, context, options),
    streamSimple: (model, context, options) => base.streamSimple(model, context, options),
  }
}

/**
 * Build the pi-ai provider for one resolved route.
 * @param {ProviderSpec} spec - the resolved route facts.
 * @returns {object} the provider to register in the adapter's `Models` collection.
 * @throws Error when the route names a wire protocol this build cannot serve.
 */
export function buildProvider(spec) {
  const catalog = catalogProvider(spec.provider)
  if (catalog !== undefined && spec.api === undefined) return reuseCatalogProvider(catalog, spec)

  const factory = spec.api === undefined ? undefined : PROTOCOLS[spec.api]
  if (factory === undefined) {
    throw new PiAiCatalogError(
      `llm-pi-ai: provider "${spec.provider}" names api "${spec.api}", which this build cannot serve;`
      + ` supported protocols are ${supportedProtocols().join(', ')}`,
    )
  }
  return createProvider({
    id: spec.provider,
    name: spec.displayName,
    ...spec.baseURL === undefined ? {} : { baseUrl: spec.baseURL },
    auth: routeAuth(spec, catalog),
    models: spec.models,
    api: factory(),
  })
}
