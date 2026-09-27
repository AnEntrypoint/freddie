/**
 * Fresh-process SDK subagent client. Drives one child Freddie runtime over
 * stdio JSON-RPC through `@freddie/freddie-sdk-client` and owns cancellation
 * and quiescent disposal. It publishes after the child handshake, maps child
 * failures to stop reasons, and tears down to quiescence. The SDK client
 * spawns the child rather than using `ctx.subprocess` — the subprocess seam's
 * documented exception for SDK-managed transports — so this driver applies
 * the seam's shared env scrub.
 */

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

/** EOF grace for child flush and nested-process teardown; wider than the signal grace below. */
export const DEFAULT_DISPOSE_EOF_GRACE_MS = 6_000

/** Default POSIX grace between SIGTERM and SIGKILL on dispose (the `disposeGraceMs` config). */
export const DEFAULT_DISPOSE_GRACE_MS = 3_000

/** Default bound on the protocol `shutdown` exchange during dispose. */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 1_000

/** Fixed safe failure text derived only from provider-owned structured facts. */
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

/** Runtime constructor seam replaced only by package-local fake-runtime tests. */
export const internals = {
  createHarness: options => new DeepSeekHarness(options),
}

/**
 * Hide a pre-spawn workspace/configuration failure behind fixed safe facts.
 * @param cause - original Host failure retained on the Error cause chain.
 * @returns an Error whose message contains only the fixed Freddie SDK failure line.
 */
export function sdkConfigurationFailure(cause) {
  return new SdkRunFailure({ stage: 'initialize', category: 'configuration' }, cause)
}

/** Classify one SDK rejection without reading its message or stderr tail. */
function sdkFailure(error, stage) {
  const facts = error instanceof TransportClosedError
    ? { stage, category: 'transport' }
    : error instanceof SdkProtocolError || error instanceof JsonRpcResponseError
      ? { stage, category: 'protocol' }
      : { stage, category: 'unknown' }
  return new SdkRunFailure(facts, error)
}

/**
 * Map one child terminal reason to its complete shared result outcome.
 * @param reason - the owned child run's final durable turn reason, or
 * `undefined` when it settled without running a turn.
 * @returns the shared stop reason and any additional safe diagnostic.
 */
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

/** Report an original Host failure without letting the observation sink replace it. */
function reportFailure(spec, error) {
  try {
    spec.onError?.(toError(error), 'error')
  } catch {
    // Host diagnostic logging cannot replace the child failure.
  }
}

/** Map an SDK-owned failed-start aggregate into safe initialize/shutdown lines. */
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

/**
 * Start and publish one SDK runtime child after its `initialize` handshake.
 * Child failures resolve through the run result. Startup rejects with fixed
 * safe facts after SDK-owned cleanup; successful cleanup proves process reap.
 * Cleanup failure preserves initialize plus shutdown for an ordinary failure,
 * or shutdown alone after cancellation, without claiming quiescence. Disposal
 * shuts the runtime down and reaps it.
 * @param request - the start request; its signal is the cancellation channel.
 * @param spec - the resolved spawn spec: launch/cwd, the child's provider/model
 * route, output cap, env, timeouts, and the optional error sink.
 * @returns the ready run handle for the child subprocess.
 */
export async function startSdkRun(request, spec) {
  if (request.signal.aborted) throw new Error('subagent request was aborted before the SDK child started')
  // The run id lives in the parent namespace; the child runtime's session id
  // (minted below, private to the wire) exists only inside the child process.
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

  // Cancellation settles the result without waiting for a cooperative child.
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

  // Establish the child handshake before publishing a handle. Any failure
  // owns the still-private process and reaps it before rejecting.
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
      // Preserve failed cleanup as a failed Job; settleStart treats only an
      // aborted non-AggregateError rejection as a cleanly killed startup.
      throw new AggregateError([cleanupFailure], cleanupFailure.message)
    }
    throw new Error('subagent request was aborted before the SDK child started')
  }

  const childSessionId = `session-${randomUUID().replaceAll('-', '')}`
  // The child's final answer under the seam's canonical selection rule
  // (`AssistantOutputFold`); a partial answer survives cancel and error paths.
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

  // Race the child turn against local cancellation; the shared settlement
  // flattens failures under the seam's never-reject contract.
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

  // There is no wire-level prompt cancel: dispose settles the result locally,
  // then the bounded shutdown request + dispose ladder tears the child down.
  return subprocessRunHandle({
    id,
    result,
    signal: request.signal,
    onAbort,
    requestCancel,
    teardown,
  })
}
