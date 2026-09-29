import { attributionHeaders, INVALID_CREDENTIAL_CODE, LlmError, normalizeApiKey } from '@freddie/freddie-llm'
import { catalogModels } from './catalog.js'

const LISTABLE_PROTOCOLS = new Set(['anthropic-messages', 'openai-completions', 'openai-responses'])

const PROTOCOL_ASSUMED_FOR_UNCHOSEN_DRAFT = 'openai-completions'

const ANTHROPIC_VERSION = '2023-06-01'

const ANTHROPIC_MODEL_LIMIT = 1000

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

function capacity(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) return candidate
  }
  return undefined
}

function label(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate
  }
  return undefined
}

function listingUrl(baseURL, api) {
  const base = baseURL.replace(/\/+$/, '')
  if (api !== 'anthropic-messages') return `${base}/models`
  const root = base.endsWith('/v1') ? base.slice(0, -3) : base
  return `${root}/v1/models?limit=${String(ANTHROPIC_MODEL_LIMIT)}`
}

const ignoreCleanupCancelFailure = () => undefined

function discoveryAborted(cause) {
  return new LlmError('model discovery aborted by caller', 'ABORTED', { cause })
}

function installedCatalogListing(provider) {
  if (provider === undefined) return undefined
  const installed = catalogModels(provider)
  if (installed.size === 0) return undefined
  return [...installed.values()].map(model => ({
    id: model.id,
    name: model.name,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  }))
}

async function readBounded(response, url) {
  const oversized = () => new LlmError(
    `${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`,
    'DISCOVERY_FAILED',
  )
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw oversized()
  }
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) throw oversized()
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(ignoreCleanupCancelFailure)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

function readListing(body) {
  const listing = body
  const data = listing?.data
  let listed
  if (Array.isArray(data)) {
    listed = data.map(raw => ({ raw }))
  } else {
    const models = listing?.models
    if (models === null || typeof models !== 'object' || Array.isArray(models)) {
      throw new LlmError(
        'the endpoint\'s model listing has neither a "data" array nor a "models" object;'
        + ' enter this provider\'s models by hand',
        'DISCOVERY_FAILED',
      )
    }
    listed = Object.entries(models)
      .filter(([, raw]) => raw !== null && typeof raw === 'object' && !Array.isArray(raw))
      .map(([key, raw]) => ({ key, raw }))
  }
  const models = []
  for (const { key, raw } of listed) {
    const entry = raw
    const id = label(key, entry?.id)
    if (id === undefined) continue
    const name = label(entry?.name, entry?.display_name, entry?.displayName) ?? id
    const contextWindow = capacity(
      entry?.contextWindow,
      entry?.context_window,
      entry?.context_length,
      entry?.max_input_tokens,
      entry?.limit?.context,
    )
    const maxTokens = capacity(
      entry?.maxOutputTokens,
      entry?.max_output_tokens,
      entry?.maxTokens,
      entry?.max_tokens,
      entry?.limit?.output,
      entry?.top_provider?.max_completion_tokens,
    )
    models.push({
      id,
      name,
      ...contextWindow === undefined ? {} : { contextWindow },
      ...maxTokens === undefined ? {} : { maxTokens },
    })
  }
  return models
}

function usableProbeKey(raw) {
  const checked = normalizeApiKey(raw)
  if (checked.ok) return checked.value
  throw new LlmError(
    checked.reason === 'empty'
      ? 'this provider\'s API key is blank; enter it on the Models page, or clear it to probe unauthenticated'
      : 'this provider\'s API key contains characters no HTTP header can carry; paste the raw key only',
    INVALID_CREDENTIAL_CODE,
  )
}

export async function discoverModels(request, storedProfile) {
  const installedListing = installedCatalogListing(request.provider)
  if (installedListing !== undefined) return installedListing
  if (request.baseURL === undefined || request.baseURL.length === 0) {
    throw new LlmError(
      `pi-ai ships no catalog for provider "${request.provider ?? ''}", so its models can only come from its`
      + ' endpoint; set a baseURL, or enter this provider\'s models by hand',
      'DISCOVERY_FAILED',
    )
  }
  const api = request.api ?? PROTOCOL_ASSUMED_FOR_UNCHOSEN_DRAFT
  if (!LISTABLE_PROTOCOLS.has(api)) {
    throw new LlmError(
      `pi-ai protocol "${api}" has no model listing this build can read; enter this provider's models by hand`,
      'DISCOVERY_UNSUPPORTED',
    )
  }
  const url = listingUrl(request.baseURL, api)
  const stored = storedProfile?.()
  const typedOrStoredKey = request.apiKey ?? await stored?.resolveApiKey()
  const apiKey = typedOrStoredKey === undefined ? undefined : usableProbeKey(typedOrStoredKey)
  let response
  try {
    const headers = new Headers(stored?.headers === undefined ? undefined : Object.entries(stored.headers))
    headers.set('accept', 'application/json')
    if (api === 'anthropic-messages') {
      headers.set('anthropic-version', ANTHROPIC_VERSION)
      if (apiKey !== undefined) headers.set('x-api-key', apiKey)
    } else if (apiKey !== undefined) {
      headers.set('authorization', `Bearer ${apiKey}`)
    }
    for (const [name, value] of Object.entries(attributionHeaders())) headers.set(name, value)
    response = await fetch(url, {
      method: 'GET',
      headers,
      ...request.signal === undefined ? {} : { signal: request.signal },
    })
  } catch (error) {
    if (request.signal?.aborted) throw discoveryAborted(error)
    throw new LlmError(`could not reach ${url}`, 'DISCOVERY_FAILED', { cause: error })
  }
  if (!response.ok) {
    throw new LlmError(
      `${url} answered ${response.status}${response.status === 401 || response.status === 403 ? '; check the API key' : ''}`,
      'DISCOVERY_FAILED',
    )
  }
  let text
  try {
    text = await readBounded(response, url)
  } catch (error) {
    if (request.signal?.aborted) throw discoveryAborted(error)
    throw error
  }
  let body
  try {
    body = JSON.parse(text)
  } catch (error) {
    throw new LlmError(`${url} did not answer with JSON`, 'DISCOVERY_FAILED', { cause: error })
  }
  return readListing(body)
}
