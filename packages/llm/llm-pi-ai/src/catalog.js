/**
 * Materialization of one provider route's model catalog. The installed pi-ai
 * catalog supplies defaults keyed by model id, and a profile's own model
 * entries override them field by field, so a route naming a catalog provider
 * stays configuration-free while a route pi-ai has never heard of is fully
 * describable from `cordis.yml`.
 *
 * Strict resolution rejects unserviceable models before settings writes.
 * Deferred resolution retains their diagnostics so stored catalog drift does
 * not prevent inspection, repair, or requests to independently valid models.
 * @module @freddie/freddie-llm-pi-ai/catalog
 */

import { builtinProviders, getBuiltinModels, getBuiltinProviders } from '@earendil-works/pi-ai/providers/all'

/** Pricing for a model the installed catalog does not describe. The harness never reads pi-ai's cost metadata. */
const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/**
 * @typedef {'text' | 'image'} PiAiModality
 * A request modality a pi-ai model may accept.
 */

/** Drift gate: a pi-ai upgrade that adds or removes a modality is caught by review against this list. */
const MODALITY_GATE = { text: true, image: true }

/** Every request modality a profile may declare. */
export const MODALITIES = Object.keys(MODALITY_GATE)

/**
 * One entry's modality list, or `undefined` when it states no answer. Absent
 * and empty mean the same thing — `[]` describes a model that accepts nothing.
 * @param {readonly PiAiModality[] | undefined} configured - the list a `models` or `modelOverrides` entry supplied.
 * @returns {PiAiModality[] | undefined} the declared modalities, or `undefined` to ask the next level.
 */
function declaredInput(configured) {
  return configured === undefined || configured.length === 0 ? undefined : [...configured]
}

/**
 * @typedef {'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'} PiAiThinkingLevel
 * A pi-ai thinking level, in pi-ai's canonical escalation order.
 */

/** Drift gate over {@link PiAiThinkingLevel}. */
const THINKING_LEVEL_GATE = {
  off: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
}

/** Every pi-ai thinking level a profile may declare, in escalation order. */
export const THINKING_LEVELS = Object.keys(THINKING_LEVEL_GATE)

/**
 * @typedef {'openai' | 'deepseek' | 'openrouter' | 'together' | 'baseten' | 'zai' | 'qwen'
 *   | 'chat-template' | 'qwen-chat-template' | 'string-thinking' | 'ant-ling'} PiAiThinkingFormat
 * One reasoning-dispatch wire format a profile may name.
 */

/** Drift gate over {@link PiAiThinkingFormat}. */
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

/** Reasoning-dispatch wire formats a profile may name, most-reached first. */
export const SUPPORTED_THINKING_FORMATS = Object.keys(THINKING_FORMAT_GATE)

/**
 * @typedef {'max_completion_tokens' | 'max_tokens'} PiAiMaxTokensField
 * An output-cap field spelling pi-ai accepts.
 */

const MAX_TOKENS_FIELD_GATE = { max_completion_tokens: true, max_tokens: true }

/** The output-cap field spellings a profile may name. */
export const MAX_TOKENS_FIELDS = Object.keys(MAX_TOKENS_FIELD_GATE)

/**
 * @typedef {'thinking_token_budget' | 'thinking_budget' | 'thinking_budget_tokens'} PiAiThinkingTokenBudgetField
 */

const THINKING_TOKEN_BUDGET_FIELD_GATE = {
  thinking_token_budget: true,
  thinking_budget: true,
  thinking_budget_tokens: true,
}

/** The reasoning-budget field spellings a profile may name. */
export const THINKING_TOKEN_BUDGET_FIELDS = Object.keys(THINKING_TOKEN_BUDGET_FIELD_GATE)

/**
 * @typedef {'anthropic'} PiAiCacheControlFormat
 * A prompt-cache marker convention pi-ai accepts.
 */

const CACHE_CONTROL_FORMAT_GATE = { anthropic: true }

/** The prompt-cache marker conventions a profile may name. */
export const CACHE_CONTROL_FORMATS = Object.keys(CACHE_CONTROL_FORMAT_GATE)

/**
 * @typedef {'thinking.enabled' | 'thinking.effort' | 'thinking.budget'} PiAiChatTemplateVar
 * A request-state placeholder a `chat_template_kwargs` value may name.
 */

const CHAT_TEMPLATE_VAR_GATE = {
  'thinking.enabled': true,
  'thinking.effort': true,
  'thinking.budget': true,
}

/** The request-state placeholders a profile may name. */
export const CHAT_TEMPLATE_VARS = Object.keys(CHAT_TEMPLATE_VAR_GATE)

let providerIndex

/**
 * Installed catalog providers by id, constructed once. Each entry owns the API
 * implementations for its own models, which is why a catalog route reuses this
 * provider instead of being rebuilt from parts.
 * @returns {ReadonlyMap<string, object>} the catalog provider index.
 */
function catalogProviders() {
  providerIndex ??= new Map(builtinProviders().map(provider => [provider.id, provider]))
  return providerIndex
}

/**
 * The installed catalog provider for one route, when pi-ai ships one.
 * @param {string} provider - provider route key.
 * @returns {object | undefined} the catalog provider, or `undefined` for a route pi-ai does not ship.
 */
export function catalogProvider(provider) {
  return catalogProviders().get(provider)
}

/**
 * Every provider route the installed pi-ai catalog ships.
 * @returns {readonly string[]} the catalog provider ids.
 */
export function catalogProviderIds() {
  return getBuiltinProviders()
}

/**
 * The installed catalog models for one route, indexed by model id.
 * @param {string} provider - provider route key.
 * @returns {Map<string, object>} catalog models by id; empty for a route pi-ai does not ship.
 */
export function catalogModels(provider) {
  if (!catalogProviders().has(provider)) return new Map()
  const models = getBuiltinModels(provider)
  return new Map(models.map(model => [model.id, model]))
}

/**
 * Whether one pi-ai compat field is configurable on a profile. `withhold` is
 * the disposition for a field pi-ai's installed catalog already sets for a
 * named vendor.
 * @typedef {'offer' | 'withhold'} CompatDisposition
 */

/** Disposition of every `OpenAICompletionsCompat` field. */
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

/** Disposition of every `OpenAIResponsesCompat` field. */
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

/** Disposition of every `AnthropicMessagesCompat` field. */
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

/** Disposition of every `BedrockCompat` field. */
const BEDROCK_COMPAT_GATE = {
  supportsStrictMode: 'offer',
}

/**
 * Keyed by protocol, but grouped by pi-ai's compat *type*: the three Responses
 * protocols share `OpenAIResponsesCompat`, so a switch settable on one is
 * settable on all three.
 */
const COMPAT_GATES = {
  'openai-completions': COMPLETIONS_COMPAT_GATE,
  'openai-responses': RESPONSES_COMPAT_GATE,
  'azure-openai-responses': RESPONSES_COMPAT_GATE,
  'openai-codex-responses': RESPONSES_COMPAT_GATE,
  'anthropic-messages': ANTHROPIC_COMPAT_GATE,
  'bedrock-converse-stream': BEDROCK_COMPAT_GATE,
}

/**
 * The compat gate of one resolved protocol. A plain lookup rather than a keyed
 * read: a route's `api` is configuration, so it may name a protocol pi-ai gives
 * no compat type — or none at all.
 * @param {string} api - resolved wire protocol.
 * @returns {Readonly<Record<string, CompatDisposition>> | undefined} that protocol's field gate.
 */
function compatGate(api) {
  return COMPAT_GATES[api]
}

/**
 * The compat entries a profile actually set. An empty dict states nothing
 * here: schemastery materializes an absent dict as `{}`, and sending no
 * arguments is exactly what leaving the field out does.
 * @param {object | undefined} compat - the configured switches, when any.
 * @returns {readonly (readonly [string, unknown])[]} the entries carrying a value, in declaration order.
 */
function configuredCompatEntries(compat) {
  return Object.entries(compat ?? {}).flatMap(([field, value]) => {
    const empty = typeof value === 'object' && value !== null && !Array.isArray(value)
      && Object.keys(value).length === 0
    return empty ? [] : [[field, value]]
  })
}

/**
 * The protocols offering one compat field, in {@link COMPAT_GATES} order.
 * @param {string} field - configured compat field name.
 * @returns {readonly string[]} the protocols whose compat takes it.
 */
function compatProtocols(field) {
  return Object.entries(COMPAT_GATES).flatMap(([api, gate]) => gate[field] === 'offer' ? [api] : [])
}

/**
 * The compat fields one protocol offers, for a diagnostic that has to show
 * what was available instead of the name that missed.
 * @param {string} api - wire protocol.
 * @returns {readonly string[]} the offered field names.
 */
function offeredCompatFields(api) {
  return Object.entries(compatGate(api) ?? {}).flatMap(([field, disposition]) => disposition === 'offer' ? [field] : [])
}

/**
 * Every offered field name, deduplicated, for the one diagnostic that cannot
 * narrow by protocol: the vocabulary check runs before any protocol resolves.
 * @returns {readonly string[]} the offered field names across every protocol.
 */
function allOfferedCompatFields() {
  const fields = new Set()
  for (const api of Object.keys(COMPAT_GATES)) {
    for (const field of offeredCompatFields(api)) fields.add(field)
  }
  return [...fields]
}

/**
 * Reject a compat key no protocol offers. Runs before any protocol is
 * resolved, so a withheld field or a misspelling fails even on a route whose
 * models never reach the protocol that would have taken it.
 * @param {string} provider - provider route key, for diagnostics.
 * @param {string} site - the configuration site, for diagnostics.
 * @param {object | undefined} compat - the configured switches, when any.
 * @returns {void}
 * @throws Error naming the offending key.
 */
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

/**
 * One configured model entry: an id plus the catalog fields it overrides.
 * @typedef {object} PiAiModelProfile
 * @property {string} id Model id sent to the provider.
 * @property {string} [name] Display name for selectors; defaults to the catalog name, then the id.
 * @property {number} [contextWindow] Maximum combined request and response context in tokens.
 * @property {number} [maxTokens] Maximum output tokens; configuring one also makes it this model's per-request default.
 * @property {PiAiModality[]} [input] Request modalities this model accepts.
 * @property {false | Record<string, string | null>} [reasoningEfforts] Selectable reasoning efforts.
 * @property {object} [compat] pi-ai wire-compatibility switches for this model.
 */

/**
 * Customization of one installed catalog model, keyed by its id.
 * @typedef {Omit<PiAiModelProfile, 'id'>} PiAiModelOverride
 */

/**
 * The route-level facts model materialization reads.
 * @typedef {object} RouteCatalogRequest
 * @property {string} provider Provider route key.
 * @property {string} [api] Wire protocol override.
 * @property {string} [baseURL] Endpoint override.
 * @property {readonly PiAiModelProfile[]} [models] Configured catalog.
 * @property {Readonly<Record<string, PiAiModelOverride>>} [modelOverrides] Installed-catalog customizations.
 * @property {object} [compat] Route-level wire-compatibility switches.
 * @property {number} defaultContextWindow Context capacity for an undescribed model.
 * @property {number} defaultMaxTokens Output capability for an undescribed model.
 * @property {PiAiModality[]} defaultInput Modalities for an undescribed model.
 */

/** An expected configuration failure that stored-catalog reads may retain for repair. */
export class PiAiCatalogError extends Error {}

/**
 * Report a route the deployment cannot serve, naming the settings key at fault.
 * @param {string} provider - provider route key.
 * @param {string} detail - what is wrong with it.
 * @returns {never}
 */
function invalid(provider, detail) {
  throw new PiAiCatalogError(`llm-pi-ai: provider "${provider}" ${detail}`)
}

/**
 * The one wire protocol a catalog route's shipped models agree on. This is what
 * lets a deployment add a model the installed catalog has not caught up with.
 * @param {ReadonlyMap<string, object>} defaults - the installed catalog models.
 * @returns {string | undefined} the shared protocol, or undefined when they disagree.
 */
function sharedCatalogApi(defaults) {
  const apis = new Set()
  for (const model of defaults.values()) apis.add(model.api)
  return apis.size === 1 ? [...apis][0] : undefined
}

/**
 * Resolve one model's reasoning capability from its declared efforts.
 *
 * A declared dict translates to pi-ai's `thinkingLevelMap` with every level
 * decided explicitly, because pi-ai's own defaulting is asymmetric — an absent
 * key means "supported" for the five base levels but "unsupported" for
 * `xhigh`/`max`.
 * @param {string} provider - provider route key, for diagnostics.
 * @param {PiAiModelProfile} entry - the configured model entry.
 * @param {object | undefined} base - the installed catalog entry of the same id.
 * @returns {{ reasoning: boolean, thinkingLevelMap?: object }} the reasoning fields.
 */
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
  /** @type {Record<string, string | null>} */
  const map = {}
  for (const level of THINKING_LEVELS) {
    const wire = efforts[level]
    if (wire === undefined) map[level] = null
    else if (wire !== null) map[level] = wire
  }
  return { reasoning: true, thinkingLevelMap: map }
}

/**
 * Resolve one model's compat block from the profile's switches. A model switch
 * wins over the route switch field by field; a model-level switch its protocol
 * does not take fails resolution, while a route-level one skips past such
 * models.
 * @param {string} provider - provider route key, for diagnostics.
 * @param {PiAiModelProfile} entry - the configured model entry.
 * @param {object | undefined} route - the route-level switches, when any.
 * @param {object | undefined} base - the installed catalog entry of the same id.
 * @param {string} api - the model's resolved wire protocol.
 * @returns {object} a `compat` field to spread into the model, or nothing.
 */
function resolveModelCompat(provider, entry, route, base, api) {
  const gate = compatGate(api)
  /** @type {Record<string, unknown>} */
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

/**
 * One route's materialized catalog, plus the request caps its profile chose.
 * @typedef {object} RouteCatalog
 * @property {readonly object[]} models The materialized models in configuration order.
 * @property {ReadonlyMap<string, string>} modelErrors Models that cannot be resolved, retained as diagnostics.
 * @property {ReadonlyMap<string, number>} configuredMaxTokens Per-request output caps explicitly configured.
 */

/**
 * Materialize one route's catalog by merging the installed catalog defaults
 * under the configured entries. A route with no configured `models` serves the
 * installed catalog unchanged.
 * @param {RouteCatalogRequest} request - the route-level catalog facts.
 * @param {'strict' | 'deferred'} [validation] - strict writes reject every error; deferred reads retain model diagnostics.
 * @returns {RouteCatalog} the materialized models and the explicitly configured request caps.
 */
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
  /** @type {object[]} */
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
