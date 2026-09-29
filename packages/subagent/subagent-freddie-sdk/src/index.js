/**
 * Out-of-process SDK subagent backend. Each child is a complete Freddie
 * runtime in its own process — own composition, session, model route, and
 * tools — driven over stdio JSON-RPC through the TypeScript SDK client, so it
 * shares no Cordis context. It accepts the provider/model/maxTokens subset of
 * `agentOptions`; other start features remain unsupported. The ONE thing it
 * reads off `request.parent` is the session's workspace cwd.
 */

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

/**
 * @typedef {object} Config
 * @property {string} [providerName] - Provider name on `ctx.subagents` (default `freddie-sdk`).
 * @property {string} command - Executable that boots the child runtime's SDK JSON-RPC server
 *   (e.g. `node`), resolved and checked at plugin load.
 * @property {string[]} [args] - Arguments to `command` (e.g. `['path/to/bin.js', '--config', 'cordis.yml']`).
 * @property {string} [cwd] - Working directory override for the child process and its SDK session
 *   workspace. A relative path resolves against the harness launch directory at load, and the
 *   result must be an existing directory. When omitted, each child inherits its delegating
 *   parent session's cwd — and starting one from a parent session that has no cwd fails.
 * @property {string} provider - Provider route the child runtime initializes with.
 * @property {string} model - Model the child runtime initializes with.
 * @property {number} [maxTokens] - Optional per-request output-token cap for the child runtime.
 * @property {Record<string, string>} [env] - Extra environment variables for the child process,
 *   forwarded on top of a credential-scrubbed copy of the parent env.
 * @property {number} [shutdownTimeoutMs] - Bound (ms) on the protocol `shutdown` exchange during dispose.
 * @property {number} [disposeEofGraceMs] - Grace period (ms) for the child's EOF-driven quiesce on dispose.
 * @property {number} [disposeGraceMs] - Termination confirmation window (ms), including forced exit.
 */

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

/** Freddie SDK can apply Agent route options while the other start features remain child-owned. */
const SDK_START_CAPABILITIES = Object.freeze({
  ...NO_START_CAPABILITIES,
  agentOptions: true,
})

/** Merge the request's supported route fields over this provider instance's defaults. */
function resolveSdkRoute(config, requested) {
  const maxTokens = requested?.maxTokens ?? config.maxTokens
  return {
    provider: requested?.provider ?? config.provider,
    model: requested?.model ?? config.model,
    ...maxTokens === undefined ? {} : { maxTokens },
  }
}

/**
 * The SDK provider. It resolves Agent route options into the child runtime's
 * process-wide handshake; output schema, depth, tool filter, and persona stay
 * unsupported because their ownership does not cross this process boundary.
 */
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

/**
 * Register one Profile-named Freddie SDK provider.
 * @param {import('@freddie/cordis').Context} ctx - context carrying the shared subagent registry.
 * @param {Config} config - launch command/args, workspace override, model route, and disposal timing.
 */
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
