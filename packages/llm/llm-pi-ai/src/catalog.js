import { builtinProviders, getBuiltinModels, getBuiltinProviders } from '@earendil-works/pi-ai/providers/all'

const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

const MODALITY_GATE = { text: true, image: true }

export const MODALITIES = Object.keys(MODALITY_GATE)

function declaredInput(configured) {
  return configured === undefined || configured.length === 0 ? undefined : [...configured]
}

const THINKING_LEVEL_GATE = {
  off: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
}

export const THINKING_LEVELS = Object.keys(THINKING_LEVEL_GATE)

const THINKING_FORMAT_GATE = {
  'openai': true,
  'deepseek': true,
  'openrouter': true,
  'together': true,
  'baseten': true,
  'zai': true,
  'qwen': true,
  'chat-template': true,
  'qwen-chat-template': true,
  'string-thinking': true,
  'ant-ling': true,
}

export const SUPPORTED_THINKING_FORMATS = Object.keys(THINKING_FORMAT_GATE)

const MAX_TOKENS_FIELD_GATE = { max_completion_tokens: true, max_tokens: true }

export const MAX_TOKENS_FIELDS = Object.keys(MAX_TOKENS_FIELD_GATE)

const THINKING_TOKEN_BUDGET_FIELD_GATE = {
  thinking_token_budget: true,
  thinking_budget: true,
  thinking_budget_tokens: true,
}

export const THINKING_TOKEN_BUDGET_FIELDS = Object.keys(THINKING_TOKEN_BUDGET_FIELD_GATE)

const CACHE_CONTROL_FORMAT_GATE = { anthropic: true }

export const CACHE_CONTROL_FORMATS = Object.keys(CACHE_CONTROL_FORMAT_GATE)

const CHAT_TEMPLATE_VAR_GATE = {
  'thinking.enabled': true,
  'thinking.effort': true,
  'thinking.budget': true,
}

export const CHAT_TEMPLATE_VARS = Object.keys(CHAT_TEMPLATE_VAR_GATE)

let providerIndex

function catalogProviders() {
  providerIndex ??= new Map(builtinProviders().map(provider => [provider.id, provider]))
  return providerIndex
}

export function catalogProvider(provider) {
  return catalogProviders().get(provider)
}

export function catalogProviderIds() {
  return getBuiltinProviders()
}

export function catalogModels(provider) {
  if (!catalogProviders().has(provider)) return new Map()
  const models = getBuiltinModels(provider)
  return new Map(models.map(model => [model.id, model]))
}

const COMPLETIONS_COMPAT_GATE = {
  supportsStore: 'offer',
  supportsDeveloperRole: 'offer',
  supportsReasoningEffort: 'offer',
  supportsUsageInStreaming: 'offer',
  supportsFinishReason: 'offer',
  maxTokensField: 'offer',
  requiresToolResultName: 'offer',
  requiresAssistantAfterToolResult: 'offer',
  requiresThinkingAsText: 'offer',
  requiresReasoningContentOnAssistantMessages: 'offer',
  thinkingFormat: 'offer',
  chatTemplateKwargs: 'offer',
  chatTemplateArgs: 'offer',
  supportsThinkingTokenBudget: 'offer',
  thinkingTokenBudgetField: 'offer',
  vllmPriority: 'offer',
  supportsStrictMode: 'offer',
  cacheControlFormat: 'offer',
  supportsLongCacheRetention: 'offer',
  openRouterRouting: 'withhold',
  vercelGatewayRouting: 'withhold',
  zaiToolStream: 'withhold',
  supportsOpenAIGrammarTools: 'withhold',
  sendSessionAffinityHeaders: 'withhold',
  deferredToolsMode: 'withhold',
  sessionAffinityFormat: 'withhold',
}

const RESPONSES_COMPAT_GATE = {
  supportsDeveloperRole: 'offer',
  supportsMaxOutputTokens: 'offer',
  supportsStrictMode: 'offer',
  supportsLongCacheRetention: 'offer',
  sessionAffinityFormat: 'withhold',
  supportsOpenAIGrammarTools: 'withhold',
  supportsAdditionalTools: 'withhold',
  supportsToolSearch: 'withhold',
  supportsExplicitPromptCacheMode: 'withhold',
}

const ANTHROPIC_COMPAT_GATE = {
  supportsEagerToolInputStreaming: 'offer',
  supportsLongCacheRetention: 'offer',
  supportsCacheControlOnTools: 'offer',
  supportsTemperature: 'offer',
  forceAdaptiveThinking: 'offer',
  allowEmptySignature: 'offer',
  supportsStrictTools: 'offer',
  sendSessionAffinityHeaders: 'withhold',
  supportsToolReferences: 'withhold',
  supportsMidConvoEffort: 'withhold',
  allowedFallbackModels: 'withhold',
}

const BEDROCK_COMPAT_GATE = {
  supportsStrictMode: 'offer',
}

const COMPAT_GATES = {
  'openai-completions': COMPLETIONS_COMPAT_GATE,
  'openai-responses': RESPONSES_COMPAT_GATE,
  'azure-openai-responses': RESPONSES_COMPAT_GATE,
  'openai-codex-responses': RESPONSES_COMPAT_GATE,
  'anthropic-messages': ANTHROPIC_COMPAT_GATE,
  'bedrock-converse-stream': BEDROCK_COMPAT_GATE,
}

function compatGate(api) {
  return COMPAT_GATES[api]
}

function configuredCompatEntries(compat) {
  return Object.entries(compat ?? {}).flatMap(([field, value]) => {
    const empty = typeof value === 'object' && value !== null && !Array.isArray(value)
      && Object.keys(value).length === 0
    return empty ? [] : [[field, value]]
  })
}

function compatProtocols(field) {
  return Object.entries(COMPAT_GATES).flatMap(([api, gate]) => gate[field] === 'offer' ? [api] : [])
}

function offeredCompatFields(api) {
  return Object.entries(compatGate(api) ?? {}).flatMap(([field, disposition]) => disposition === 'offer' ? [field] : [])
}

function allOfferedCompatFields() {
  const fields = new Set()
  for (const api of Object.keys(COMPAT_GATES)) {
    for (const field of offeredCompatFields(api)) fields.add(field)
  }
  return [...fields]
}

function assertOfferedCompatFields(provider, site, compat) {
  for (const [field, value] of Object.entries(compat ?? {})) {
    if (compatProtocols(field).length === 0) {
      const declared = Object.values(COMPAT_GATES).some(gate => gate[field] !== undefined)
      if (declared) {
        invalid(provider, `${site} sets compat "${field}", which is not configurable here: pi-ai's installed`
          + ' catalog sets it for the vendors that need it, so name that provider as the route instead')
      }
      invalid(provider, `${site} sets compat "${field}", which no wire protocol declares; the configurable`
        + ` switches are ${allOfferedCompatFields().join(', ')}`)
    }
    if (value == null) {
      invalid(provider, `${site} sets compat "${field}" with no value; give it one, or remove the key to`
        + " leave the field to the next layer — the installed catalog entry, then pi-ai's own detection")
    }
  }
}

export class PiAiCatalogError extends Error {}

function invalid(provider, detail) {
  throw new PiAiCatalogError(`llm-pi-ai: provider "${provider}" ${detail}`)
}

function sharedCatalogApi(defaults) {
  const apis = new Set()
  for (const model of defaults.values()) apis.add(model.api)
  return apis.size === 1 ? [...apis][0] : undefined
}

function resolveModelReasoning(provider, entry, base) {
  const efforts = entry.reasoningEfforts
  if (efforts === undefined) return { reasoning: base?.reasoning ?? false }
  if (efforts === false) return { reasoning: false }
  if (efforts === null || Object.keys(efforts).length === 0) {
    invalid(provider, `model "${entry.id}" has an empty reasoningEfforts; declare the offered levels, set`
      + " false for a non-reasoning model, or omit the field to keep the installed catalog's capability")
  }
  const declared = THINKING_LEVELS.flatMap((level) => {
    const wire = efforts[level]
    return wire === undefined ? [] : [[level, wire]]
  })
  for (const [level, wire] of declared) {
    if (wire === null) {
      if (level !== 'off') {
        invalid(provider, `model "${entry.id}" reasoningEfforts.${level} needs the wire value dispatch`
          + ' should send; only "off" may leave it empty')
      }
    } else if (wire.length === 0) {
      invalid(provider, `model "${entry.id}" reasoningEfforts.${level} must not be an empty string`)
    }
  }
  if (!declared.some(([level]) => level !== 'off')) {
    invalid(provider, `model "${entry.id}" reasoningEfforts offers no level beyond "off"; declare a thinking`
      + ' level, or set reasoningEfforts to false for a non-reasoning model')
  }
  const map = {}
  for (const level of THINKING_LEVELS) {
    const wire = efforts[level]
    if (wire === undefined) map[level] = null
    else if (wire !== null) map[level] = wire
  }
  return { reasoning: true, thinkingLevelMap: map }
}

function resolveModelCompat(provider, entry, route, base, api) {
  const gate = compatGate(api)
  const configured = {}
  for (const [field, value] of configuredCompatEntries(route)) {
    if (gate?.[field] !== 'offer') continue
    configured[field] = value
  }
  for (const [field, value] of configuredCompatEntries(entry.compat)) {
    if (gate?.[field] !== 'offer') {
      const offered = offeredCompatFields(api)
      invalid(provider, `model "${entry.id}" sets compat "${field}", but its api is "${api}", which does not`
        + ` take it; that switch exists on ${compatProtocols(field).join(', ')}, and "${api}" offers`
        + ` ${offered.length === 0 ? 'no configurable compat' : offered.join(', ')}`)
    }
    configured[field] = value
  }
  if (Object.keys(configured).length === 0) return {}
  const inherited = base?.api === api ? base.compat : undefined
  return { compat: { ...inherited, ...configured } }
}

export function resolveRouteModels(request, validation = 'strict') {
  const { provider } = request
  const defaults = catalogModels(provider)
  const providerBaseUrl = catalogProvider(provider)?.baseUrl
  const configured = request.models ?? []
  const overrides = request.modelOverrides ?? {}
  const modelErrors = new Map()
  for (const [id, override] of Object.entries(overrides)) {
    if (id.length === 0) invalid(provider, 'has a modelOverrides entry with an empty model id')
    if (defaults.size === 0) {
      invalid(provider, `sets modelOverrides for "${id}", but the installed catalog does not describe this route;`
        + ' a declared route spells every model out in its models list')
    }
    if (configured.length > 0) {
      invalid(provider, `sets modelOverrides for "${id}" beside a models list; models already replaces the served`
        + ' catalog, so declare the fields on its entries')
    }
    if (!defaults.has(id)) {
      const message = `modelOverrides names "${id}", which the installed catalog does not describe`
      if (validation === 'strict') invalid(provider, message)
      modelErrors.set(id, `llm-pi-ai: provider "${provider}" ${message}`)
    }
    if ('id' in override) {
      invalid(provider, `modelOverrides entry "${id}" sets "id", which is the dict key`)
    }
  }
  const entries = configured.length > 0
    ? configured
    : [...defaults.values()].map(model => ({ id: model.id, ...overrides[model.id] }))
  if (entries.length === 0) {
    invalid(provider, 'resolves no models; the installed catalog does not describe this route, so its models'
      + ' must be listed in configuration')
  }
  const routeApi = sharedCatalogApi(defaults)
  assertOfferedCompatFields(provider, 'route', request.compat)
  const seen = new Set()
  const configuredMaxTokens = new Map()
  const resolveEntry = (entry) => {
    assertOfferedCompatFields(provider, `model "${entry.id}"`, entry.compat)
    if (entry.id.length === 0) invalid(provider, 'has a model with an empty id')
    if (seen.has(entry.id)) invalid(provider, `lists model "${entry.id}" more than once`)
    seen.add(entry.id)
    const base = defaults.get(entry.id)
    const api = request.api ?? base?.api ?? routeApi
    if (api === undefined) {
      invalid(provider, `model "${entry.id}" needs an api; the installed catalog does not describe it, so set the`
        + " route's api to the wire protocol its endpoint speaks")
    }
    const baseUrl = request.baseURL ?? base?.baseUrl ?? providerBaseUrl
    if (baseUrl === undefined) {
      invalid(provider, `model "${entry.id}" needs a baseURL; the installed catalog does not describe this route`)
    }
    const contextWindow = entry.contextWindow ?? base?.contextWindow ?? request.defaultContextWindow
    if (!Number.isInteger(contextWindow) || contextWindow <= 0) {
      invalid(provider, `model "${entry.id}" contextWindow must be a positive integer`)
    }
    const maxTokens = entry.maxTokens ?? base?.maxTokens ?? request.defaultMaxTokens
    if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
      invalid(provider, `model "${entry.id}" maxTokens must be a positive integer`)
    }
    if (entry.maxTokens !== undefined) configuredMaxTokens.set(entry.id, entry.maxTokens)
    return {
      ...base,
      id: entry.id,
      name: entry.name ?? base?.name ?? entry.id,
      api,
      provider,
      baseUrl,
      input: declaredInput(entry.input) ?? base?.input ?? [...request.defaultInput],
      cost: base?.cost ?? NO_COST,
      contextWindow,
      maxTokens,
      ...resolveModelReasoning(provider, entry, base),
      ...resolveModelCompat(provider, entry, request.compat, base, api),
    }
  }
  const models = []
  for (const entry of entries) {
    let model
    try {
      model = resolveEntry(entry)
    } catch (error) {
      if (validation === 'strict' || !(error instanceof PiAiCatalogError)) throw error
      modelErrors.set(entry.id, error.message)
      continue
    }
    models.push(model)
  }
  const serviceableModels = models.filter(model => !modelErrors.has(model.id))
  for (const [field] of configuredCompatEntries(request.compat)) {
    const takers = compatProtocols(field)
    if (serviceableModels.some(model => takers.includes(model.api))) continue
    invalid(provider, `sets compat "${field}", but no model on the route speaks a protocol that takes it;`
      + ` it exists on ${takers.join(', ')}`)
  }
  return { models: serviceableModels, configuredMaxTokens, modelErrors }
}
