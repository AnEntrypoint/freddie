/**
 * Generic pi-ai-backed implementation of the Harness LLM seam.
 *
 * Each resolution produces one **immutable** snapshot — the profiles plus a
 * `Models` collection holding the `Provider` each route built — and an
 * operation captures a whole snapshot before its first `await`. A
 * configuration change builds a *new* collection rather than mutating the one
 * in use, because `Models.streamSimple()` is lazy: it resolves the provider
 * when the stream is first consumed, which is after the credential await, so a
 * mutated collection would let a request that started under one configuration
 * finish under another — or fail with a provider that no longer exists. This is
 * what makes the seam's per-step call freeze (`llm.prepareCall()`) hold all the
 * way down: switching models mid-reply takes effect on the next step, never
 * inside the one in flight.
 *
 * A route naming a credential reference still resolves it through the harness
 * seam and passes it as the request's `apiKey` option, which pi-ai treats as
 * the highest-priority auth override — that is what keeps the fail-loud
 * reference semantics. Everything that override does not cover reaches pi-ai
 * through the collection's own auth: the credential store holds the records a
 * login wrote and a refresh rotates, and the auth context answers the ambient
 * questions a provider asks while resolving. Both are stable across snapshots,
 * so a configuration change rebuilds the collection without forgetting who is
 * signed in.
 * @module @freddie/freddie-llm-pi-ai/adapter
 */

import {
  attributionHeaders,
  contentHasImage,
  LlmAdapter,
  LlmError,
  ReasoningEffortId,
} from '@freddie/freddie-llm'
import { idleWatchdog, timeoutOf } from '@freddie/freddie-timeout'
import { toPiContext } from './context.js'
import { createModels, getSupportedThinkingLevels } from './models.js'
import { toStreamChunks } from './stream.js'

/** Idle timeout code every route's watchdog arms. */
const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'

/**
 * One resolution's frozen view: the profiles and the collection built from them.
 * @typedef {object} PiAiSnapshot
 * @property {ReadonlyMap<string, object>} profiles The resolved profiles this collection was built from, used as its identity.
 * @property {object} models Providers for exactly those profiles; never mutated once published.
 */

/**
 * Constructor options for {@link PiAiAdapter}: the resolution hooks the plugin owns.
 * @typedef {object} PiAiAdapterOptions
 * @property {() => ReadonlyMap<string, object>} profiles Current validated profiles by provider route; called once per operation.
 * @property {(provider: string, profile: object) => Promise<string | undefined>} resolveApiKey Resolve the credential for one already-resolved profile; called once per stream call and frozen for that call. `undefined` defers to the route's own pi-ai auth, which for an installed catalog route is its provider-native ambient discovery; the plugin allows that only for a profile naming no credential at all, because a named reference that misses throws `LlmError` `MISSING_CREDENTIAL` rather than falling back.
 * @property {object} auth The two auth injectables every collection is built with.
 * @property {() => object | undefined} [resolveAttachments] Resolve the optional durable attachment service at request time.
 * @property {(detail: { provider: string, model: string, reason: string }) => void} [onReplayDegrade] Observe one assistant history message degrading to provider-neutral conversion because its stored replay state is unusable by this build.
 */

const SDK_RETRIES_DISABLED = 0

/**
 * Ask a stream iterator to stop, discarding the failure its aborted SDK raises
 * while tearing down: the stable signal already owns termination, so a
 * return-time abort adds no outcome.
 * @param {AsyncIterator<object>} iterator - the harness chunk iterator being abandoned.
 * @returns {Promise<void>} settles once the iterator has returned or failed quietly.
 */
async function swallowAbortedSdkTeardown(iterator) {
  try {
    await iterator.return(undefined)
  } catch {
    return
  }
}

/**
 * Copy profile stream knobs into pi-ai's common option vocabulary.
 * @param {object} profile - the resolved route profile.
 * @param {string | undefined} reasoning - the resolved reasoning level.
 * @param {string | undefined} apiKey - the harness-resolved credential override.
 * @returns {object} the pi-ai stream options this profile owns.
 */
function profileOptions(profile, reasoning, apiKey) {
  const enabledReasoning = reasoning === 'off' ? undefined : reasoning
  return {
    ...apiKey === undefined ? {} : { apiKey },
    ...enabledReasoning === undefined ? {} : { reasoning: enabledReasoning },
    ...profile.thinkingBudgets === undefined ? {} : { thinkingBudgets: profile.thinkingBudgets },
    ...profile.cacheRetention === undefined ? {} : { cacheRetention: profile.cacheRetention },
    ...profile.transport === undefined ? {} : { transport: profile.transport },
    ...profile.timeoutMs === undefined ? {} : { timeoutMs: profile.timeoutMs },
    ...profile.websocketConnectTimeoutMs === undefined ? {} : { websocketConnectTimeoutMs: profile.websocketConnectTimeoutMs },
    maxRetries: SDK_RETRIES_DISABLED,
  }
}

/**
 * The profile default this exact model can actually take, for DESCRIBING it.
 * A configured level the model does not support yields none rather than
 * throwing: `resolveModel` builds the model catalog, and a catalog that fails
 * takes its whole provider out of every picker — so one mis-set profile field
 * would hide every model on the route, including the ones that support the
 * level. The request path still refuses, which is where a bad configuration
 * belongs: describing what a model can do must not fail because a deployment
 * asked it for something it cannot.
 * @param {object} model - the resolved model descriptor.
 * @param {string | undefined} effort - the profile's configured level, if any.
 * @returns {string | undefined} the level when this model supports it, otherwise undefined.
 */
function describableReasoningLevel(model, effort) {
  if (effort === undefined) return undefined
  return getSupportedThinkingLevels(model).some(level => level === effort) ? effort : undefined
}

/**
 * Validate an explicit harness/profile effort without invoking pi-ai's clamp.
 * @param {object} model - the resolved model descriptor.
 * @param {string | undefined} effort - the effort to validate.
 * @returns {string | undefined} the validated level.
 */
function resolveReasoningLevel(model, effort) {
  if (effort === undefined) return undefined
  const supported = getSupportedThinkingLevels(model)
  if (supported.some(level => level === effort)) return effort
  throw new LlmError(
    `pi-ai provider "${model.provider}" model "${model.id}" does not support reasoning effort "${effort}"`,
    'UNSUPPORTED_REASONING_EFFORT',
  )
}

/**
 * Selectable reasoning efforts for one model, or nothing at all.
 *
 * A model that carries no reasoning metadata — every hand-declared one, and
 * every catalog model pi-ai marks as non-reasoning — is reported by pi-ai as
 * supporting the single level `off`. Passing that through would offer a control
 * that cannot do what it says: `off` is translated to *omitting* the reasoning
 * option, which for such a model is byte-for-byte the same request as naming no
 * effort — so a provider whose own default is to think would keep thinking with
 * `off` selected. Omitting `reasoning` entirely is the seam's way of saying the
 * capability is unavailable, which leaves the surface offering only the
 * provider's default.
 * @param {object} model - the resolved model descriptor.
 * @param {string | undefined} defaultLevel - the profile's configured effort, already validated.
 * @returns {object} the `reasoning` field, or an empty object when none can be offered.
 */
function reasoningInfo(model, defaultLevel) {
  if (!model.reasoning) return {}
  const levels = getSupportedThinkingLevels(model)
  return {
    reasoning: {
      efforts: levels.map(level => ({
        id: ReasoningEffortId(level),
        name: `${level.charAt(0).toUpperCase()}${level.slice(1)}`,
      })),
      ...defaultLevel === undefined ? {} : { defaultEffort: ReasoningEffortId(defaultLevel) },
    },
  }
}

/**
 * Merge deployment headers while removing case-insensitive attribution collisions.
 * @param {Readonly<Record<string, string>> | undefined} headers - the route's configured headers.
 * @returns {Record<string, string>} the request headers.
 */
function requestHeaders(headers) {
  const attribution = attributionHeaders()
  const reserved = new Set(Object.keys(attribution).map(name => name.toLowerCase()))
  return {
    ...Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => !reserved.has(name.toLowerCase()))),
    ...attribution,
  }
}

/**
 * pi-ai-backed multi-provider adapter. Each operation reads the current
 * profiles, so a configuration change reaches the next request without a
 * restart; model descriptors come from the collection those profiles built.
 */
export class PiAiAdapter extends LlmAdapter {
  /**
   * @param {PiAiAdapterOptions} config - the resolution hooks the plugin owns.
   */
  constructor(config) {
    super()
    this.config = config
    /** @type {PiAiSnapshot | undefined} */
    this.snapshot = undefined
  }

  /**
   * The snapshot for the current profiles. Resolution memoizes its result, so
   * an unchanged configuration is recognized by identity; a changed one gets a
   * brand-new collection, leaving any snapshot an operation already captured
   * untouched for as long as that operation holds it.
   * @returns {PiAiSnapshot} the current snapshot.
   */
  current() {
    const profiles = this.config.profiles()
    if (this.snapshot?.profiles === profiles) return this.snapshot
    const models = createModels(this.config.auth)
    for (const profile of profiles.values()) {
      if (profile.piProvider !== undefined) models.setProvider(profile.piProvider)
    }
    this.snapshot = { profiles, models }
    return this.snapshot
  }

  /**
   * The profile for one route within one snapshot, or the not-owned failure.
   * @param {PiAiSnapshot} snapshot - the captured snapshot.
   * @param {string} provider - the provider route.
   * @returns {object} the resolved profile.
   */
  profileOf(snapshot, provider) {
    const profile = snapshot.profiles.get(provider)
    if (profile === undefined) {
      throw new LlmError(`pi-ai adapter does not own provider "${provider}"`, 'NO_ADAPTER')
    }
    return profile
  }

  /**
   * The configured descriptor for one exact route/model pair within one snapshot.
   * @param {PiAiSnapshot} snapshot - the captured snapshot.
   * @param {string} provider - the provider route.
   * @param {string} model - the exact model id.
   * @returns {object} the pi-ai model descriptor.
   */
  modelOf(snapshot, provider, model) {
    const profile = this.profileOf(snapshot, provider)
    const failure = profile.modelErrors.get(model)
      ?? (profile.piProvider === undefined ? profile.catalogError : undefined)
    if (failure !== undefined) throw new LlmError(failure, 'INVALID_CONFIG')
    const resolved = snapshot.models.getModel(provider, model)
    if (resolved === undefined) {
      throw new LlmError(`pi-ai provider "${provider}" has no configured model "${model}"`, 'UNKNOWN_MODEL')
    }
    return resolved
  }

  /**
   * @param {string} provider - the provider route.
   * @returns {{ id: string, name: string }} the route identity for selectors.
   */
  providerInfo(provider) {
    return { id: provider, name: this.current().profiles.get(provider)?.displayName ?? provider }
  }

  /**
   * @param {string} provider - the provider route.
   * @returns {object | undefined} the route's resolved retry policy.
   */
  providerRetryPolicy(provider) {
    return this.current().profiles.get(provider)?.retryPolicy
  }

  /**
   * @param {string} provider - the provider route.
   * @returns {Promise<readonly object[]>} the route's selectable models.
   */
  listModels(provider) {
    return Promise.resolve().then(() => {
      const snapshot = this.current()
      this.profileOf(snapshot, provider)
      return snapshot.models.getModels(provider).map(model => ({
        provider,
        id: model.id,
        name: model.name,
        inputModalities: [...model.input],
      }))
    })
  }

  /**
   * @param {string} provider - the provider route.
   * @param {string} model - the exact model id.
   * @param {AbortSignal} [_signal] - cancellation for asynchronous lookup.
   * @returns {Promise<object>} the resolved model info.
   */
  resolveModel(provider, model, _signal) {
    return Promise.resolve().then(() => this.modelInfo(this.current(), provider, model))
  }

  /**
   * @param {PiAiSnapshot} snapshot - the captured snapshot.
   * @param {string} provider - the provider route.
   * @param {string} model - the exact model id.
   * @returns {object} the resolved model info.
   */
  modelInfo(snapshot, provider, model) {
    const profile = this.profileOf(snapshot, provider)
    const resolvedModel = this.modelOf(snapshot, provider, model)
    const defaultLevel = describableReasoningLevel(resolvedModel, profile.reasoning)
    const configuredMaxTokens = profile.configuredMaxTokens.get(model)
    return {
      provider,
      id: model,
      name: resolvedModel.name,
      inputModalities: [...resolvedModel.input],
      context: { contextWindow: resolvedModel.contextWindow },
      ...configuredMaxTokens === undefined ? {} : { defaultMaxTokens: configuredMaxTokens },
      ...reasoningInfo(resolvedModel, defaultLevel),
    }
  }

  /**
   * @param {string} provider - the provider route.
   * @param {string} model - the exact model id.
   * @param {AbortSignal} [_signal] - cancellation for asynchronous lookup.
   * @returns {Promise<object>} the prepared call, frozen to this snapshot.
   */
  prepareCall(provider, model, _signal) {
    const snapshot = this.current()
    return Promise.resolve({
      model: this.modelInfo(snapshot, provider, model),
      stream: options => this.streamWithSnapshot(options, snapshot),
    })
  }

  /**
   * @param {object} options - the harness request.
   * @returns {AsyncIterable<object>} the harness chunk stream.
   */
  stream(options) {
    return this.streamWithSnapshot(options, this.current())
  }

  /**
   * Stream one request against the snapshot captured with it.
   * @param {object} options - the harness request.
   * @param {PiAiSnapshot} snapshot - the snapshot captured for this call.
   * @returns {AsyncGenerator<object>} the harness chunks.
   */
  async * streamWithSnapshot(options, snapshot) {
    if (options.stop !== undefined) {
      throw new LlmError('llm-pi-ai does not support GenerateOptions.stop', 'UNSUPPORTED_OPTION')
    }
    const profile = this.profileOf(snapshot, options.provider)
    const model = this.modelOf(snapshot, options.provider, options.model)
    const reasoning = resolveReasoningLevel(model, options.reasoningEffort ?? profile.reasoning)
    const apiKey = await this.config.resolveApiKey(options.provider, profile)

    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    const streamIdleTimeoutMs = profile.streamIdleTimeoutMs
    using watchdog = idleWatchdog(upstream, streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)

    try {
      const containsImage = options.messages.some(message => contentHasImage(message.content))
      if (containsImage && !model.input.includes('image')) {
        throw new LlmError(`pi-ai model "${model.id}" does not support image input`, 'UNSUPPORTED_CONTENT')
      }
      const attachments = containsImage ? this.config.resolveAttachments?.() : undefined
      if (containsImage && attachments === undefined) {
        throw new LlmError('pi-ai image input requires the durable attachment service', 'UNSUPPORTED_CONTENT')
      }
      const onReplayDegrade = (reason) => {
        this.config.onReplayDegrade?.({ provider: options.provider, model: options.model, reason })
      }
      const context = attachments === undefined
        ? toPiContext(options, undefined, onReplayDegrade)
        : await toPiContext({ ...options, signal: watchdog.signal }, {
          attachments,
          maxRequestImageBytes: profile.maxRequestImageBytes,
          requestImagePolicy: {
            maxPixels: profile.requestImagePixelBudget,
            maxBytes: profile.requestImageMaxBytes,
          },
        }, onReplayDegrade)
      const events = snapshot.models.streamSimple(model, context, {
        ...profileOptions(profile, reasoning, apiKey),
        ...options.temperature === undefined ? {} : { temperature: options.temperature },
        ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
        ...options.sessionId === undefined ? {} : { sessionId: String(options.sessionId) },
        signal: watchdog.signal,
        headers: requestHeaders(profile.headers),
      })
      const iterator = toStreamChunks(events, model.contextWindow, options.signal, model.id)[Symbol.asyncIterator]()
      let exhausted = false
      try {
        while (true) {
          const result = await watchdog.next(iterator)
          const timeout = timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE)
          if (timeout !== undefined) throw timeout
          if (result.done) {
            exhausted = true
            return
          }
          yield result.value
        }
      } finally {
        if (!exhausted) {
          consumer.abort('pi-ai stream consumer stopped')
          await swallowAbortedSdkTeardown(iterator)
        }
      }
    } catch (error) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
        throw new LlmError(`pi-ai stream idle timeout after ${streamIdleTimeoutMs}ms`, 'TIMEOUT', { cause: error })
      }
      if (options.signal?.aborted) {
        throw new LlmError('pi-ai request aborted by caller', 'ABORTED', { cause: error })
      }
      throw error
    } finally {
      consumer.abort('pi-ai stream consumer stopped')
    }
  }
}
