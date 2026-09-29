import { Context, Service } from '@freddie/cordis'
import { freezeMessage } from './message.js'
import { resolveRetryPolicy } from './retry-policy.js'
import { callConfigEquals, deepFreeze } from './call-config.js'
import { HarnessError, INVALID_CREDENTIAL_CODE } from './error.js'
import { normalizeLlmFailure } from './adapter-failure.js'
import { normalizeApiKey } from './api-key.js'
import { contentHasImage, projectImagesForTextModel } from './content.js'

export * from './attribution.js'
export * from './brand.js'
export * from './never.js'
export * from './error.js'
export * from './api-key.js'
export * from './types.js'
export * from './content.js'
export * from './message.js'
export * from './retry-policy.js'
export { BlockAssembler } from './assembler.js'
export { callConfigEquals, deepFreeze, isAgentLoopRequest, markAgentLoopRequest } from './call-config.js'

export class LlmError extends HarnessError {
  failure

  constructor(message, code, options) {
    if (typeof message !== 'string' || message.length === 0) throw new Error('LlmError message must be a non-empty string')
    if (typeof code !== 'string' || code.length === 0) throw new Error('LlmError code must be a non-empty string')
    if (options?.status !== undefined
      && (!Number.isInteger(options.status) || options.status < 100 || options.status > 599)) {
      throw new Error('LlmError status must be an integer from 100 through 599')
    }
    if (options?.providerRetryAfterMs !== undefined
      && (!Number.isFinite(options.providerRetryAfterMs) || options.providerRetryAfterMs <= 0)) {
      throw new Error('LlmError providerRetryAfterMs must be a positive finite number')
    }
    if (options?.requestId !== undefined
      && (typeof options.requestId !== 'string' || options.requestId.length === 0)) {
      throw new Error('LlmError requestId must be a non-empty string')
    }
    super(message, code, options)
    this.name = 'LlmError'
    this.failure = Object.freeze({
      message,
      code,
      ...options?.status === undefined ? {} : { status: options.status },
      ...options?.providerRetryAfterMs === undefined ? {} : { providerRetryAfterMs: options.providerRetryAfterMs },
      ...options?.requestId === undefined ? {} : { requestId: options.requestId },
    })
  }
}

export function assertUsableApiKey(raw, pkg, ref) {
  const checked = normalizeApiKey(raw)
  if (checked.ok) return checked.value
  throw new LlmError(
    checked.reason === 'empty'
      ? `${pkg}: the API key resolved from ${ref} is blank; set ${ref} to the raw key`
        + ' (the web Models page writes it) or export it in the launching environment'
      : `${pkg}: the API key resolved from ${ref} contains characters no HTTP header can carry;`
        + ` set ${ref} to the raw key alone (the web Models page writes it)`,
    INVALID_CREDENTIAL_CODE,
  )
}

export class LlmAdapter {
  providerInfo(provider) {
    return { id: provider, name: provider }
  }

  providerRetryPolicy(_provider) {
    return undefined
  }

  listModels(_provider) {
    return Promise.resolve([])
  }

  resolveModel(provider, model, _signal) {
    return Promise.resolve({ provider, id: model, name: model })
  }

  async prepareCall(provider, model, signal) {
    return {
      model: await this.resolveModel(provider, model, signal),
      stream: options => this.stream(options),
    }
  }

  stream(_options) {
    throw new Error('LlmAdapter.stream must be implemented by subclasses')
  }
}

export class LlmRuntime extends Service {
  adapters = new Map()
  directory = new Map()
  discoveries = new Map()

  constructor(ctx) {
    super(ctx, 'llm')
  }

  emitAdaptersUpdated() {
    let invariantFailure
    for (const listener of this.ctx.events.dispatch('emit', ['llm/adapters-updated'])) {
      try {
        const returned = listener()
        if (returned != null && typeof returned.then === 'function') {
          void Promise.resolve(returned).then(undefined, (error) => {
            this.warnAdaptersListenerFailure(error)
          })
        }
      } catch (error) {
        if (error?.code === 'INVARIANT') {
          invariantFailure ??= error
          continue
        }
        this.warnAdaptersListenerFailure(error)
      }
    }
    if (invariantFailure !== undefined) throw invariantFailure
  }

  warnAdaptersListenerFailure(error) {
    this.ctx.logger.warn('llm: an llm/adapters-updated listener failed')
    this.ctx.logger.warn(error)
  }

  registerAdapter(providers, adapter) {
    const owned = new Set()
    let released = false
    const dispose = this.ctx.effect(function* () {
      if (providers.length === 0) throw new LlmError('an adapter must register at least one provider', 'INVALID_ADAPTER')
      this.commitRoutes(owned, this.prepareRoutes(providers, adapter, owned))
      yield () => {
        released = true
        for (const provider of owned) this.adapters.delete(provider)
        owned.clear()
        this.emitAdaptersUpdated()
      }
    }.bind(this), 'llm.registerAdapter()')
    const handle = (() => void dispose())
    handle.replace = (next) => {
      if (released) {
        throw new LlmError('a disposed adapter registration cannot replace its routes', 'REGISTRATION_DISPOSED')
      }
      this.commitRoutes(owned, this.prepareRoutes(next, adapter, owned))
    }
    return handle
  }

  prepareRoutes(providers, adapter, owned) {
    const unique = new Set()
    const registrations = []
    for (const provider of providers) {
      if (provider.length === 0) throw new LlmError('adapter provider names must be non-empty', 'INVALID_ADAPTER')
      if (unique.has(provider) || (this.adapters.has(provider) && !owned.has(provider))) {
        throw new LlmError(`an adapter for provider "${provider}" is already registered`, 'DUPLICATE_ADAPTER')
      }
      const info = adapter.providerInfo(provider)
      if (typeof info.id !== 'string' || info.id !== provider || typeof info.name !== 'string' || info.name.length === 0) {
        throw new LlmError(`adapter metadata for provider "${provider}" must preserve its id and have a non-empty name`, 'INVALID_ADAPTER')
      }
      unique.add(provider)
      const retryPolicy = adapter.providerRetryPolicy(provider)
        ?? resolveRetryPolicy(undefined, `llm: provider "${provider}" retryPolicy`)
      registrations.push({
        adapter,
        provider: { id: info.id, name: info.name },
        retryPolicy,
      })
    }
    return registrations
  }

  commitRoutes(owned, registrations) {
    for (const provider of owned) this.adapters.delete(provider)
    owned.clear()
    for (const registration of registrations) {
      this.adapters.set(registration.provider.id, registration)
      owned.add(registration.provider.id)
    }
    this.emitAdaptersUpdated()
  }

  listProviders() {
    return [...this.adapters.values()].map(({ provider }) => ({ ...provider }))
  }

  registerConfigurableProviders(entries) {
    let held = []
    let disposed = false
    const commit = (candidates) => {
      const detached = []
      const own = new Set(held.map(entry => entry.provider))
      for (const entry of candidates) {
        if (entry.provider.length === 0 || entry.displayName.length === 0 || entry.settingsNs.length === 0) {
          throw new LlmError('configurable providers need a non-empty provider, displayName, and settingsNs', 'INVALID_DIRECTORY')
        }
        if (entry.settingsPath.some(segment => segment.length === 0)) {
          throw new LlmError(`configurable provider "${entry.provider}" has an empty settingsPath segment`, 'INVALID_DIRECTORY')
        }
        if ((this.directory.has(entry.provider) && !own.has(entry.provider))
          || detached.some(seen => seen.provider === entry.provider)) {
          throw new LlmError(`configurable provider "${entry.provider}" is already declared`, 'DUPLICATE_DIRECTORY')
        }
        detached.push({ ...entry, settingsPath: [...entry.settingsPath] })
      }
      for (const entry of held) this.directory.delete(entry.provider)
      for (const entry of detached) this.directory.set(entry.provider, entry)
      held = detached
      this.emitAdaptersUpdated()
    }

    const dispose = this.ctx.effect(function* () {
      if (entries.length === 0) {
        throw new LlmError('a configurable-provider registration must declare at least one provider', 'INVALID_DIRECTORY')
      }
      commit(entries)
      yield () => {
        disposed = true
        for (const entry of held) this.directory.delete(entry.provider)
        held = []
        this.emitAdaptersUpdated()
      }
    }.bind(this), 'llm.registerConfigurableProviders()')

    const handle = (() => void dispose())
    handle.replace = (next) => {
      if (disposed) {
        throw new LlmError('this configurable-provider registration was disposed', 'REGISTRATION_DISPOSED')
      }
      commit(next)
    }
    return handle
  }

  listConfigurableProviders() {
    return [...this.directory.values()].map(entry => ({ ...entry, settingsPath: [...entry.settingsPath] }))
  }

  registerModelDiscovery(settingsNs, discover) {
    const dispose = this.ctx.effect(function* () {
      if (settingsNs.length === 0) {
        throw new LlmError('model discovery needs a non-empty settings namespace', 'INVALID_DISCOVERY')
      }
      if (this.discoveries.has(settingsNs)) {
        throw new LlmError(`model discovery for "${settingsNs}" is already registered`, 'DUPLICATE_DISCOVERY')
      }
      this.discoveries.set(settingsNs, discover)
      yield () => {
        this.discoveries.delete(settingsNs)
      }
    }.bind(this), 'llm.registerModelDiscovery()')
    return () => void dispose()
  }

  async discoverModels(settingsNs, request) {
    const discover = this.discoveries.get(settingsNs)
    if (discover === undefined) {
      throw new LlmError(`no model discovery is registered for "${settingsNs}"`, 'NO_DISCOVERY')
    }
    if ((request.provider ?? '').length === 0 && (request.baseURL ?? '').length === 0) {
      throw new LlmError('model discovery needs a provider route or a baseURL', 'INVALID_DISCOVERY')
    }
    const discovered = await discover(request)
    const seen = new Set()
    const models = []
    for (const model of discovered) {
      if (typeof model.id !== 'string' || model.id.length === 0 || seen.has(model.id)) continue
      seen.add(model.id)
      models.push({
        id: model.id,
        ...model.name === undefined ? {} : { name: model.name },
        ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
        ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
      })
    }
    return models
  }

  providerRetryPolicy(provider) {
    return this.registration(provider).retryPolicy
  }

  detachedModalities(modalities) {
    return modalities === undefined ? undefined : [...modalities]
  }

  async listModels(provider) {
    const adapter = this.registration(provider).adapter
    const models = await adapter.listModels(provider)
    const seen = new Set()
    return models.map((model) => {
      if (
        typeof model.provider !== 'string'
        || model.provider !== provider
        || typeof model.id !== 'string'
        || model.id.length === 0
        || typeof model.name !== 'string'
        || model.name.length === 0
        || (model.description !== undefined && typeof model.description !== 'string')
        || seen.has(model.id)
      ) {
        throw new LlmError(`adapter returned invalid or duplicate model metadata for provider "${provider}"`, 'INVALID_CATALOG')
      }
      seen.add(model.id)
      const inputModalities = this.detachedModalities(model.inputModalities)
      return {
        provider: model.provider,
        id: model.id,
        name: model.name,
        ...model.description === undefined ? {} : { description: model.description },
        ...inputModalities === undefined ? {} : { inputModalities },
      }
    })
  }

  async resolveModelInfo(provider, model, signal) {
    return this.resolveModelInfoFor(this.registration(provider), model, signal)
  }

  async resolveModelInfoFor(registration, model, signal) {
    const resolved = await registration.adapter.resolveModel(registration.provider.id, model, signal)
    return this.normalizeModelInfo(registration, model, resolved)
  }

  normalizeModelInfo(registration, model, resolved) {
    const provider = registration.provider.id
    if (
      typeof resolved.provider !== 'string'
      || resolved.provider !== provider
      || typeof resolved.id !== 'string'
      || resolved.id !== model
      || typeof resolved.name !== 'string'
      || resolved.name.length === 0
      || (resolved.description !== undefined && typeof resolved.description !== 'string')
    ) {
      throw new LlmError(
        `adapter returned invalid exact model metadata for provider "${provider}" model "${model}"`,
        'INVALID_MODEL_INFO',
      )
    }
    const context = resolved.context
    if (context !== undefined && (!Number.isInteger(context.contextWindow) || context.contextWindow <= 0)) {
      throw new LlmError(
        `adapter returned invalid context metadata for provider "${provider}" model "${model}"`,
        'INVALID_MODEL_CONTEXT',
      )
    }
    const inputModalities = this.detachedModalities(resolved.inputModalities)
    const defaultMaxTokens = resolved.defaultMaxTokens
    if (defaultMaxTokens !== undefined
      && (!Number.isSafeInteger(defaultMaxTokens) || defaultMaxTokens <= 0)) {
      throw new LlmError(
        `adapter returned invalid default maxTokens for provider "${provider}" model "${model}"`,
        'INVALID_MODEL_MAX_TOKENS',
      )
    }
    const info = {
      provider,
      id: model,
      name: resolved.name,
      ...resolved.description === undefined ? {} : { description: resolved.description },
      ...inputModalities === undefined ? {} : { inputModalities },
      ...context === undefined ? {} : { context: { contextWindow: context.contextWindow } },
      ...defaultMaxTokens === undefined ? {} : { defaultMaxTokens },
    }
    const reasoning = resolved.reasoning
    if (reasoning === undefined) return info
    if (reasoning.efforts.length === 0) {
      throw new LlmError(
        `adapter returned invalid reasoning metadata for provider "${provider}" model "${model}"`,
        'INVALID_MODEL_REASONING',
      )
    }
    const seen = new Set()
    const efforts = reasoning.efforts.map((effort) => {
      if (
        typeof effort.id !== 'string'
        || effort.id.length === 0
        || typeof effort.name !== 'string'
        || effort.name.length === 0
        || (effort.description !== undefined && typeof effort.description !== 'string')
        || seen.has(effort.id)
      ) {
        throw new LlmError(
          `adapter returned invalid or duplicate reasoning effort metadata for provider "${provider}" model "${model}"`,
          'INVALID_MODEL_REASONING',
        )
      }
      seen.add(effort.id)
      return {
        id: effort.id,
        name: effort.name,
        ...effort.description === undefined ? {} : { description: effort.description },
      }
    })
    if (reasoning.defaultEffort !== undefined && !seen.has(reasoning.defaultEffort)) {
      throw new LlmError(
        `adapter returned an unknown default reasoning effort for provider "${provider}" model "${model}"`,
        'INVALID_MODEL_REASONING',
      )
    }
    return {
      ...info,
      reasoning: {
        efforts,
        ...reasoning.defaultEffort === undefined ? {} : { defaultEffort: reasoning.defaultEffort },
      },
    }
  }

  async resolveCallConfig(config, signal) {
    return (await this.resolveCallFor(this.registration(config.provider), config, signal)).config
  }

  async resolveCallFor(registration, config, signal) {
    const info = await this.resolveModelInfoFor(registration, config.model, signal)
    return this.resolveCallWithInfo(config, info)
  }

  resolveCallWithInfo(config, info) {
    const defaulted = config.maxTokens === undefined && info.defaultMaxTokens !== undefined
      ? { ...config, maxTokens: info.defaultMaxTokens }
      : config
    const reasoning = info.reasoning
    const requested = defaulted.reasoningEffort
    let resolvedConfig = defaulted
    if (reasoning === undefined) {
      if (requested !== undefined) {
        throw new LlmError(
          `provider "${config.provider}" model "${config.model}" does not support reasoning effort "${requested}"`,
          'UNSUPPORTED_REASONING_EFFORT',
        )
      }
    } else {
      const effective = requested ?? reasoning.defaultEffort
      if (effective !== undefined) {
        if (!reasoning.efforts.some(effort => effort.id === effective)) {
          throw new LlmError(
            `provider "${config.provider}" model "${config.model}" does not support reasoning effort "${effective}"`,
            'UNSUPPORTED_REASONING_EFFORT',
          )
        }
        if (requested !== effective) resolvedConfig = { ...defaulted, reasoningEffort: effective }
      }
    }
    return {
      config: resolvedConfig,
      ...info.context === undefined ? {} : { context: info.context },
      modelInfo: info,
    }
  }

  async prepareCall(config, signal) {
    const registration = this.registration(config.provider)
    const adapterCall = await registration.adapter.prepareCall(config.provider, config.model, signal)
    const modelInfo = this.normalizeModelInfo(registration, config.model, adapterCall.model)
    const resolved = this.resolveCallWithInfo(config, modelInfo)
    const resolvedConfig = deepFreeze(structuredClone(resolved.config))
    const context = resolved.context === undefined
      ? undefined
      : deepFreeze(structuredClone(resolved.context))
    const adapterDefaults = deepFreeze({
      ...config.reasoningEffort === undefined && resolvedConfig.reasoningEffort !== undefined
        ? { reasoningEffort: true }
        : {},
      ...config.maxTokens === undefined && resolvedConfig.maxTokens !== undefined
        ? { maxTokens: true }
        : {},
    })
    let dispatched = false
    return Object.freeze({
      config: resolvedConfig,
      retryPolicy: registration.retryPolicy,
      adapterDefaults,
      ...context === undefined ? {} : { context },
      ...modelInfo.inputModalities === undefined
        ? {}
        : { inputModalities: Object.freeze([...modelInfo.inputModalities]) },
      stream: (options) => {
        if (dispatched) {
          throw new LlmError('a prepared LLM call can only be dispatched once', 'INVALID_PREPARED_CALL')
        }
        if (!callConfigEquals(options, resolvedConfig)) {
          throw new LlmError(
            'prepared LLM call config changed before adapter dispatch',
            'INVALID_PREPARED_CALL',
          )
        }
        dispatched = true
        return this.streamWithRegistration(options, {
          registration,
          config: resolvedConfig,
          modelInfo,
          dispatch: options => adapterCall.stream(options),
        })
      },
    })
  }

  registration(provider) {
    const registration = this.adapters.get(provider)
    if (!registration) throw new LlmError(`no adapter registered for provider "${provider}"`, 'NO_ADAPTER')
    return registration
  }

  forAdapter(options, adapter) {
    const messages = options.messages.map((message) => {
      const source = message.source
      if (message.role !== 'assistant' || source.kind !== 'model' || source.replayState === undefined) return message
      if (this.adapters.get(source.provider)?.adapter === adapter) return message
      return freezeMessage({
        ...message,
        source: { kind: 'model', provider: source.provider, model: source.model },
      })
    })
    if (messages.every((message, index) => message === options.messages[index])) return options
    const filtered = { ...options, messages }
    return Object.isFrozen(options) ? deepFreeze(filtered) : filtered
  }

  async * adapterStream(options, prepared) {
    let iterator
    try {
      const registration = prepared?.registration ?? this.registration(options.provider)
      const adapter = registration.adapter
      let modelInfo
      let resolvedConfig
      let dispatch
      if (prepared === undefined) {
        const adapterCall = await adapter.prepareCall(options.provider, options.model, options.signal)
        modelInfo = this.normalizeModelInfo(registration, options.model, adapterCall.model)
        resolvedConfig = this.resolveCallWithInfo(options, modelInfo).config
        dispatch = options => adapterCall.stream(options)
      } else {
        modelInfo = prepared.modelInfo
        resolvedConfig = prepared.config
        dispatch = prepared.dispatch
      }
      if (prepared !== undefined && !callConfigEquals(options, resolvedConfig)) {
        throw new LlmError(
          'prepared LLM call config changed before adapter dispatch',
          'INVALID_PREPARED_CALL',
        )
      }
      const resolvedOptions = callConfigEquals(options, resolvedConfig)
        ? options
        : Object.isFrozen(options)
          ? deepFreeze({ ...options, ...resolvedConfig })
          : { ...options, ...resolvedConfig }
      const projectedOptions = modelInfo.inputModalities !== undefined
        && !modelInfo.inputModalities.includes('image')
        && resolvedOptions.messages.some(message => contentHasImage(message.content))
        ? Object.isFrozen(resolvedOptions)
          ? deepFreeze({ ...resolvedOptions, messages: projectImagesForTextModel(resolvedOptions.messages) })
          : { ...resolvedOptions, messages: projectImagesForTextModel(resolvedOptions.messages) }
        : resolvedOptions
      const stream = dispatch(this.forAdapter(projectedOptions, adapter))
      iterator = stream[Symbol.asyncIterator]()
    } catch (error) {
      yield adapterFailureChunk(error, options.signal)
      return
    }

    let completed = false
    try {
      while (true) {
        let item
        try {
          const next = await iterator.next()
          item = next.done
            ? { done: true }
            : { done: false, value: next.value }
        } catch (error) {
          completed = true
          yield adapterFailureChunk(error, options.signal)
          return
        }
        if (item.done) {
          completed = true
          return
        }
        yield item.value
      }
    } finally {
      if (!completed) {
        const close = iterator.return?.bind(iterator)
        if (close) await close()
      }
    }
  }

  stream(options) {
    return this.streamWithRegistration(options)
  }

  streamWithRegistration(options, prepared) {
    return this.ctx.waterfall(
      this,
      'llm/stream',
      options,
      () => this.adapterStream(options, prepared),
    )
  }
}

function adapterFailureChunk(error, signal) {
  const failure = normalizeLlmFailure(error)
  return {
    type: 'finish',
    reason: signal?.aborted || failure.code === 'ABORTED'
      ? { kind: 'aborted', failure }
      : { kind: 'error', failure },
  }
}

export default LlmRuntime
