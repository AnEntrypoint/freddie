import z from '@freddie/schemastery'
import { assertPositiveFinite, NO_START_CAPABILITIES, resolveChildCwd, validateConfiguredCwd } from '@freddie/freddie-subagent'
import {
  DEFAULT_DISPOSE_EOF_GRACE_MS,
  DEFAULT_DISPOSE_GRACE_MS,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  sdkConfigurationFailure,
  startSdkRun,
} from './run.js'

export const name = 'subagent-freddie-sdk'
export const inject = ['subagents']


export const Config = z.object({
  providerName: z.string().default('freddie-sdk'),
  command: z.string().min(1).required(),
  args: z.array(z.string()).default([]),
  cwd: z.string(),
  provider: z.string().required(),
  model: z.string().required(),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER),
  env: z.dict(z.string()).default({}),
  shutdownTimeoutMs: z.number().default(DEFAULT_SHUTDOWN_TIMEOUT_MS),
  disposeEofGraceMs: z.number().default(DEFAULT_DISPOSE_EOF_GRACE_MS),
  disposeGraceMs: z.number().default(DEFAULT_DISPOSE_GRACE_MS),
})

const SDK_START_CAPABILITIES = Object.freeze({
  ...NO_START_CAPABILITIES,
  agentOptions: true,
})

function resolveSdkRoute(config, requested) {
  const maxTokens = requested?.maxTokens ?? config.maxTokens
  return {
    provider: requested?.provider ?? config.provider,
    model: requested?.model ?? config.model,
    ...maxTokens === undefined ? {} : { maxTokens },
  }
}

class SdkSubagentProvider {
  capabilities = SDK_START_CAPABILITIES
  inheritsParentContext = false

  constructor(name, ctx, config) {
    this.name = name
    this.ctx = ctx
    this.config = config
    this.agentRouteDefaults = Object.freeze({ provider: config.provider, model: config.model })
  }

  start(request) {
    if (request.signal.aborted) {
      throw new Error('subagent request was aborted before the SDK child started')
    }
    let cwd
    try {
      cwd = resolveChildCwd('subagent-freddie-sdk', this.config.cwd, request.parent.session.header.cwd)
    } catch (error) {
      const failure = sdkConfigurationFailure(error)
      this.ctx.logger.warn(`subagent-freddie-sdk "${this.name}": child start failed: %o`, error)
      throw failure
    }
    const route = resolveSdkRoute(this.config, request.agentOptions)
    const spec = {
      launch: { command: this.config.command, args: this.config.args, cwd, env: this.config.env },
      cwd,
      ...route,
      shutdownTimeoutMs: this.config.shutdownTimeoutMs,
      disposeEofGraceMs: this.config.disposeEofGraceMs,
      disposeGraceMs: this.config.disposeGraceMs,
      onError: (error, stopReason) => {
        this.ctx.logger.warn(`subagent-freddie-sdk "${this.name}": child run failed (${stopReason}): ${error.message}`)
      },
    }
    return startSdkRun(request, spec)
  }
}

export function apply(ctx, config) {
  assertPositiveFinite('subagent-freddie-sdk', 'shutdownTimeoutMs', config.shutdownTimeoutMs)
  assertPositiveFinite('subagent-freddie-sdk', 'disposeEofGraceMs', config.disposeEofGraceMs)
  assertPositiveFinite('subagent-freddie-sdk', 'disposeGraceMs', config.disposeGraceMs)
  if (config.maxTokens !== undefined && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new TypeError('subagent-freddie-sdk maxTokens must be a positive safe integer')
  }
  const configuredCwd = validateConfiguredCwd('subagent-freddie-sdk', config.cwd)
  const validated = {
    ...config,
    ...configuredCwd === undefined ? {} : { cwd: configuredCwd },
  }
  ctx.subagents.registerProvider(new SdkSubagentProvider(validated.providerName, ctx, validated))
}
