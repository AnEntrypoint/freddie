import { randomUUID } from 'node:crypto'
import {
  DeepSeekHarness,
  JsonRpcResponseError,
  SdkProtocolError,
  TransportClosedError,
} from '@freddie/freddie-sdk-client'
import { SessionId } from '@freddie/freddie-session'
import { AssistantOutputFold, settleRunResult, subprocessRunHandle } from '@freddie/freddie-subagent'
import { scrubbedParentEnv } from '@freddie/freddie-subprocess'

export const DEFAULT_DISPOSE_EOF_GRACE_MS = 6_000

export const DEFAULT_DISPOSE_GRACE_MS = 3_000

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 1_000

function failureDiagnostic(facts) {
  const fields = [
    'provider: Freddie SDK',
    `stage: ${facts.stage}`,
    `category: ${facts.category}`,
  ]
  return `Subagent failure (${fields.join('; ')})`
}

class SdkRunFailure extends Error {
  constructor(facts, cause) {
    super(`subagent-freddie-sdk: ${failureDiagnostic(facts)}`, { cause })
    this.name = 'SdkRunFailure'
    this.facts = facts
  }
}

export const internals = {
  createHarness: options => new DeepSeekHarness(options),
}

export function sdkConfigurationFailure(cause) {
  return new SdkRunFailure({ stage: 'initialize', category: 'configuration' }, cause)
}

function sdkFailure(error, stage) {
  const facts = error instanceof TransportClosedError
    ? { stage, category: 'transport' }
    : error instanceof SdkProtocolError || error instanceof JsonRpcResponseError
      ? { stage, category: 'protocol' }
      : { stage, category: 'unknown' }
  return new SdkRunFailure(facts, error)
}

export function sdkChildOutcome(reason) {
  switch (reason?.kind) {
    case 'completed':
      return { stopReason: 'completed' }
    case 'max-tokens':
      return { stopReason: 'max-tokens' }
    case 'aborted':
      return reason.reason?.kind === 'disposed'
        ? {
          stopReason: 'aborted',
          diagnostic: failureDiagnostic({ stage: 'session-run', category: 'child-disposed' }),
        }
        : { stopReason: 'aborted' }
    case 'blocked':
      return { stopReason: 'refusal' }
    case 'error':
      return {
        stopReason: 'error',
        diagnostic: failureDiagnostic({ stage: 'session-run', category: 'child-error' }),
      }
    case 'interrupted':
      return { stopReason: 'error' }
    case undefined:
      return {
        stopReason: 'error',
        diagnostic: failureDiagnostic({ stage: 'session-run', category: 'missing-terminal' }),
      }
    default:
      return {
        stopReason: 'error',
        diagnostic: failureDiagnostic({ stage: 'session-run', category: 'child-unknown' }),
      }
  }
}

function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}

function reportFailure(spec, error) {
  try {
    spec.onError?.(toError(error), 'error')
  } catch {
  }
}

function sdkStartupFailure(spec, error) {
  if (!(error instanceof AggregateError) || error.errors.length < 2) {
    reportFailure(spec, error)
    return sdkFailure(error, 'initialize')
  }
  const initializeError = error.errors[0]
  const cleanupError = error.errors[1]
  reportFailure(spec, initializeError)
  reportFailure(spec, cleanupError)
  const initializeFailure = sdkFailure(initializeError, 'initialize')
  const cleanupFailure = new SdkRunFailure({ stage: 'shutdown', category: 'unknown' }, cleanupError)
  return new AggregateError(
    [initializeFailure, cleanupFailure],
    `${initializeFailure.message}; ${cleanupFailure.message}`,
  )
}

export async function startSdkRun(request, spec) {
  if (request.signal.aborted) throw new Error('subagent request was aborted before the SDK child started')
  const id = SessionId(randomUUID())

  const harness = internals.createHarness({
    launch: spec.launch,
    cwd: spec.cwd,
    provider: spec.provider,
    model: spec.model,
    ...spec.maxTokens === undefined ? {} : { maxTokens: spec.maxTokens },
    shutdownTimeoutMs: spec.shutdownTimeoutMs,
    disposeEofGraceMs: spec.disposeEofGraceMs,
    disposeGraceMs: spec.disposeGraceMs,
  })

  const flags = { cancelled: false }
  let signalCancelSettled
  const cancelSettled = new Promise((resolve) => { signalCancelSettled = resolve })
  const requestCancel = () => {
    if (flags.cancelled) return
    flags.cancelled = true
    signalCancelSettled()
  }
  const onAbort = () => { requestCancel() }
  request.signal.addEventListener('abort', onAbort, { once: true })
  const cancelledStartup = new Error('subagent cancelled before the SDK child initialized')

  try {
    await Promise.race([
      harness.start(),
      cancelSettled.then(() => { throw cancelledStartup }),
    ])
    if (flags.cancelled) throw cancelledStartup
  } catch (error) {
    request.signal.removeEventListener('abort', onAbort)
    if (error !== cancelledStartup) {
      throw sdkStartupFailure(spec, error)
    }
    try {
      await harness.close()
    } catch (cleanupError) {
      reportFailure(spec, cleanupError)
      const cleanupFailure = new SdkRunFailure({ stage: 'shutdown', category: 'unknown' }, cleanupError)
      throw new AggregateError([cleanupFailure], cleanupFailure.message)
    }
    throw new Error('subagent request was aborted before the SDK child started')
  }

  const childSessionId = `session-${randomUUID().replaceAll('-', '')}`
  const fold = new AssistantOutputFold()
  const observe = (notification) => {
    if (notification.method !== 'session.event' || notification.params.sessionId !== childSessionId) return
    fold.push(notification.params.event)
  }
  const collectOutput = () => fold.collect() ?? []
  const teardown = async () => {
    try {
      await harness.close()
    } catch (error) {
      reportFailure(spec, error)
      throw new SdkRunFailure({ stage: 'shutdown', category: 'unknown' }, error)
    }
  }

  let diagnostic
  const result = settleRunResult({
    attempt: async () => {
      try {
        const turn = await Promise.race([
          harness.session(childSessionId).run(request.prompt, { onNotification: observe }),
          cancelSettled.then(() => 'cancelled'),
        ])
        if (turn === 'cancelled') return { output: collectOutput(), stopReason: 'aborted' }
        const lastEnd = turn.events.findLast(event => event.type === 'turn/end')
        const outcome = sdkChildOutcome(lastEnd?.data.reason)
        diagnostic = outcome.diagnostic
        return {
          output: collectOutput(),
          ...outcome,
        }
      } catch (error) {
        diagnostic = failureDiagnostic(sdkFailure(error, 'session-run').facts)
        throw error
      }
    },
    collectOutput,
    collectDiagnostic: () => diagnostic,
    cancelled: () => flags.cancelled,
    onError: spec.onError,
    signal: request.signal,
    onAbort,
  })

  return subprocessRunHandle({
    id,
    result,
    signal: request.signal,
    onAbort,
    requestCancel,
    teardown,
  })
}
