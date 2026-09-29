import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import { catalogProvider, PiAiCatalogError } from './catalog.js'
import { createProvider } from './models.js'

const PROTOCOLS = {
  'openai-completions': openAICompletionsApi,
  'openai-responses': openAIResponsesApi,
  'anthropic-messages': anthropicMessagesApi,
}

export function supportedProtocols() {
  return Object.keys(PROTOCOLS)
}

function harnessApiKeyAuth(name) {
  return {
    name,
    resolve: ({ credential }) => Promise.resolve({
      auth: credential?.key === undefined ? {} : { apiKey: credential.key },
      source: name,
    }),
  }
}

function routeAuth(spec, catalog) {
  if (catalog === undefined) return { apiKey: harnessApiKeyAuth(spec.displayName) }
  if (catalog.auth.apiKey !== undefined || !spec.namesCredential) return catalog.auth
  return { ...catalog.auth, apiKey: harnessApiKeyAuth(spec.displayName) }
}

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
