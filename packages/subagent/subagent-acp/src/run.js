/**
 * Fresh-process ACP subagent client. Drives one child session and owns
 * cancellation and quiescent disposal.
 */

import { randomUUID } from 'node:crypto'
import { Readable as NodeReadable, Writable as NodeWritable } from 'node:stream'
import {
  client as createAcpClientApp,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk'
import { SessionId } from '@freddie/freddie-session'
import { AssistantOutputFold, settleRunResult, subprocessRunHandle } from '@freddie/freddie-subagent'

/** EOF grace for child flush and nested-process teardown; wider than the signal grace below. */
export const DEFAULT_DISPOSE_EOF_GRACE_MS = 6_000

/** Default POSIX grace between SIGTERM and SIGKILL on dispose (the `disposeGraceMs` config). */
export const DEFAULT_DISPOSE_GRACE_MS = 3_000

const ACP_TOOL_KINDS = new Set([
  'read', 'edit', 'delete', 'move', 'search',
  'execute', 'think', 'fetch', 'switch_mode', 'other',
])

const ALLOWING_OPTION_KINDS = ['allow_once', 'allow_always']

const NO_OPTIONAL_CLIENT_CAPABILITIES = Object.freeze({})

const PIPED_PROTOCOL_WITH_INHERITED_DIAGNOSTICS = Object.freeze({ stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' })

const neverSettles = () => new Promise(() => {})

/** Fixed safe failure text derived only from provider-owned structured facts. */
function failureDiagnostic(facts) {
  const fields = [
    'provider: ACP',
    `stage: ${facts.stage}`,
    `category: ${facts.category}`,
  ]
  if (facts.stopReason !== undefined) fields.push(`stop reason: ${facts.stopReason}`)
  if (facts.outcome?.exitCode !== null && facts.outcome?.exitCode !== undefined) {
    fields.push(`exit code: ${facts.outcome.exitCode}`)
  }
  if (facts.outcome?.signal !== null && facts.outcome?.signal !== undefined) {
    fields.push(`signal: ${facts.outcome.signal}`)
  }
  return `Subagent failure (${fields.join('; ')})`
}

/** Fixed permission fact; ACP tool titles and option text never enter it. */
function permissionDiagnostic(permission) {
  return `ACP unattended decision (policy: ${permission.policy}; request: ${permission.request}; decision: ${permission.decision})`
}

/** Put the operation failure first, followed by the latest permission decision. */
function diagnosticText(facts, permission) {
  const failure = failureDiagnostic(facts)
  return permission === undefined ? failure : `${failure}\n${permissionDiagnostic(permission)}`
}

class AcpRunFailure extends Error {
  constructor(facts, cause) {
    super(`subagent-acp: ${failureDiagnostic(facts)}`, { cause })
    this.name = 'AcpRunFailure'
    this.facts = facts
  }
}

/**
 * Hide a pre-spawn workspace/configuration failure behind fixed safe facts.
 * @param cause - original Host failure retained on the Error cause chain.
 * @returns an Error whose message contains only the fixed ACP failure line.
 */
export function acpConfigurationFailure(cause) {
  return new AcpRunFailure({ stage: 'initialize', category: 'configuration' }, cause)
}

/** Keep only the closed ACP tool-kind vocabulary; future values use a fixed fallback. */
function permissionRequestKind(kind) {
  const candidate = kind ?? 'unknown'
  return ACP_TOOL_KINDS.has(candidate) ? candidate : 'unknown'
}

/** Bounded managed-range exit wait: observes the handle's range until it is empty or `ms` elapses. */
async function rangeExitsWithin(child, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, ms)
  try {
    return await child.waitForExit(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Cooperative teardown ladder for an out-of-process agent, over the seam's
 * public verbs; resolves only at whole-range quiescence: stdin EOF (the
 * child's window to flush persistence and reap its own descendants), then the
 * terminate() escalation (SIGTERM → spec grace → SIGKILL) and its whole-range
 * exit proof.
 * @param child - the spawned ACP child's handle.
 * @param eofGraceMs - tier-1 window after stdin EOF.
 */
export async function disposeAcpChild(child, eofGraceMs) {
  const failures = []
  child.stdin?.end()
  let exited = false
  try {
    exited = await rangeExitsWithin(child, eofGraceMs)
  } catch (error) {
    failures.push(toError(error))
  }
  if (exited) return
  child.terminate()
  try {
    await child.waitForExit()
  } catch (error) {
    failures.push(toError(error))
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'ACP subprocess teardown failed')
}

/**
 * Map an ACP StopReason to a harness SubagentStopReason.
 * @param reason - the terminal reason from the child's `session/prompt` response.
 * @returns the harness equivalent; `max_turn_requests` and any unknown future
 * variant map to `error`, so an unclean stop is never reported as `completed`.
 */
export function acpStopReason(reason) {
  switch (reason) {
    case 'end_turn':
      return 'completed'
    case 'max_tokens':
      return 'max-tokens'
    case 'refusal':
      return 'refusal'
    case 'cancelled':
      return 'aborted'
    case 'max_turn_requests':
      return 'error'
    default:
      return 'error'
  }
}

/**
 * Collect the text of an ACP content block (non-text blocks contribute nothing).
 * @param content - the content block off a streamed `agent_message_chunk`.
 * @returns the block's text, or `''` for a non-text block.
 */
export function acpContentText(content) {
  return content.type === 'text' ? content.text : ''
}

/**
 * Translate the harness prompt blocks into ACP prompt blocks (text only).
 * @param prompt - the harness prompt; non-text blocks are dropped.
 * @returns the ACP text blocks, in order.
 */
export function toAcpPrompt(prompt) {
  const blocks = []
  for (const block of prompt) {
    if (block.type === 'text') blocks.push({ type: 'text', text: block.text })
  }
  return blocks
}

function toError(value) {
  return value instanceof Error ? value : new Error(String(value))
}

/** Report an original Host failure without letting the observation sink replace it. */
function reportFailure(spec, error) {
  try {
    spec.onError?.(toError(error), 'error')
  } catch {}
}

/** Classify an unpublished failure from the active protocol operation and observed process facts. */
function startupFailure(error, stage, outcome) {
  return new AcpRunFailure(
    outcome === undefined
      ? { stage, category: 'transport' }
      : { stage, category: 'process-exit', outcome },
    error,
  )
}

/** Map one remote terminal reason to the optional safe failure line it needs. */
function terminalFailure(reason, permission) {
  switch (reason) {
    case 'end_turn':
      return undefined
    case 'max_turn_requests':
      return diagnosticText({
        stage: 'prompt',
        category: 'remote-limit',
        stopReason: 'max_turn_requests',
      }, permission)
    case 'max_tokens':
    case 'refusal':
    case 'cancelled':
      return permission === undefined ? undefined : permissionDiagnostic(permission)
    default:
      return diagnosticText({ stage: 'prompt', category: 'unknown', stopReason: 'unknown' }, permission)
  }
}

/**
 * Start and publish one ACP child after initialization and session creation.
 * Child failures resolve through the run result. Startup rejects with fixed
 * safe facts after provider-owned cleanup; successful cleanup proves managed
 * range quiescence. Cleanup failure preserves startup plus teardown facts for
 * an ordinary failure, or teardown alone after cancellation, without claiming
 * quiescence. Disposal cancels, terminates, and settles the child's managed
 * range.
 * @param request - the start request; its signal is the cancellation channel.
 * @param spec - the resolved spawn spec: command/args/cwd, env, permission
 * policy, dispose graces, and the optional error sink.
 * @returns the ready run handle for the child subprocess.
 */
export async function startAcpRun(request, spec) {
  if (request.signal.aborted) throw new Error('subagent request was aborted before the ACP child started')
  const parentNamespaceLifecycleId = SessionId(randomUUID())

  let child
  try {
    child = spec.spawn({
      argv: [spec.command, ...spec.args],
      cwd: spec.cwd,
      stdio: { ...PIPED_PROTOCOL_WITH_INHERITED_DIAGNOSTICS },
      graceMs: spec.disposeGraceMs,
      env: spec.env,
    })
  } catch (error) {
    reportFailure(spec, error)
    throw new AcpRunFailure({ stage: 'process', category: 'process-start' }, error)
  }
  if (child.stdin === undefined || child.stdout === undefined) {
    throw new Error('subagent-acp: subprocess implementation dropped a piped protocol stream')
  }
  let processOutcome
  let processFailure
  const processDone = child.done.then(
    (outcome) => {
      processOutcome = outcome
      return outcome
    },
    (error) => {
      processFailure = toError(error)
      throw processFailure
    },
  )

  const processRejected = processDone.then(
    neverSettles,
    err => Promise.reject(toError(err)),
  )
  processRejected.catch(() => {})

  const observeProcessOutcome = async (signal) => {
    if (processOutcome !== undefined) return processOutcome
    const timeout = AbortSignal.timeout(Math.ceil(spec.disposeGraceMs))
    const bound = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const aborted = Promise.withResolvers()
    const onObservationAbort = () => { aborted.resolve(undefined) }
    bound.addEventListener('abort', onObservationAbort, { once: true })
    if (bound.aborted) onObservationAbort()
    try {
      return await Promise.race([processDone, aborted.promise])
    } catch {
      return processOutcome
    } finally {
      bound.removeEventListener('abort', onObservationAbort)
    }
  }

  let processDisposal
  const disposeProcessOnce = () => (processDisposal ??= disposeAcpChild(child, spec.disposeEofGraceMs))

  const fold = new AssistantOutputFold()
  const flags = { cancelled: false }
  let latestPermission

  const foldAssistantTextOnly = (update) => {
    if (update.sessionUpdate === 'agent_message_chunk') {
      fold.pushText(acpContentText(update.content))
    }
  }

  const clientApp = createAcpClientApp({ name: 'freddie-subagent-acp' })
    .onNotification(methods.client.session.update, ({ params }) => {
      foldAssistantTextOnly(params.update)
      return Promise.resolve()
    })
    .onRequest(methods.client.session.requestPermission, ({ params }) => {
      if (spec.permission === 'allow') {
        const allow = params.options.find(option => ALLOWING_OPTION_KINDS.includes(option.kind))
        if (allow !== undefined) {
          latestPermission = {
            policy: 'allow',
            request: permissionRequestKind(params.toolCall.kind),
            decision: 'allowed',
          }
          return Promise.resolve({ outcome: { outcome: 'selected', optionId: allow.optionId } })
        }
      }
      latestPermission = {
        policy: spec.permission,
        request: permissionRequestKind(params.toolCall.kind),
        decision: 'denied',
      }
      return Promise.resolve({ outcome: { outcome: 'cancelled' } })
    })

  const connection = clientApp.connect(ndJsonStream(
    NodeWritable.toWeb(child.stdin),
    NodeReadable.toWeb(child.stdout),
  ))
  const agent = connection.agent

  let sessionId
  let startupStage = 'initialize'
  let signalCancelSettled
  const cancelSettled = new Promise((resolve) => { signalCancelSettled = resolve })
  const notifyCancelBestEffort = () => {
    if (sessionId === undefined) return
    void agent.notify(methods.agent.session.cancel, { sessionId }).catch(() => {})
  }
  const requestCancel = () => {
    if (flags.cancelled) return
    flags.cancelled = true
    signalCancelSettled()
    notifyCancelBestEffort()
  }
  const onAbort = () => { requestCancel() }
  request.signal.addEventListener('abort', onAbort, { once: true })

  const collectOutput = () => fold.collect() ?? []

  try {
    await Promise.race([
      (async () => {
        await agent.request(methods.agent.initialize, {
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: { ...NO_OPTIONAL_CLIENT_CAPABILITIES },
        })
        startupStage = 'new-session'
        const session = await agent.request(methods.agent.session.new, { cwd: spec.cwd, mcpServers: [] })
        const returnedSessionId = session.sessionId
        if (typeof returnedSessionId !== 'string') {
          throw new AcpRunFailure(
            { stage: 'new-session', category: 'protocol' },
            new Error('ACP child published without a session id'),
          )
        }
        sessionId = returnedSessionId
        if (flags.cancelled) throw new Error('subagent cancelled before the ACP session started')
      })(),
      processRejected,
      cancelSettled.then(() => { throw new Error('subagent cancelled before the ACP session started') }),
    ])
  } catch (error) {
    request.signal.removeEventListener('abort', onAbort)
    const cancelledBeforeCleanup = flags.cancelled
    const needsProcessExitClassification = !cancelledBeforeCleanup && !(error instanceof AcpRunFailure)
    const observedOutcome = needsProcessExitClassification ? await observeProcessOutcome() : undefined
    const startup = cancelledBeforeCleanup
      ? { kind: 'cancelled' }
      : {
        kind: 'failed',
        failure: error instanceof AcpRunFailure ? error : startupFailure(error, startupStage, observedOutcome),
      }
    if (startup.kind !== 'cancelled') {
      reportFailure(spec, error instanceof AcpRunFailure ? error.cause : processFailure ?? error)
    }
    try {
      await disposeProcessOnce()
    } catch (cleanupError) {
      reportFailure(spec, cleanupError)
      const cleanupFailure = new AcpRunFailure({
        stage: 'teardown',
        category: processOutcome === undefined ? 'unknown' : 'process-exit',
        ...processOutcome === undefined ? {} : { outcome: processOutcome },
      }, cleanupError)
      if (startup.kind === 'cancelled') {
        throw new AggregateError([cleanupFailure], cleanupFailure.message)
      }
      throw new AggregateError(
        [startup.failure, cleanupFailure],
        `${startup.failure.message}; ${cleanupFailure.message}`,
      )
    }
    if (startup.kind === 'cancelled') {
      throw new Error('subagent request was aborted before the ACP child started')
    }
    throw startup.failure
  }
  if (sessionId === undefined) throw new Error('unreachable: ACP startup fulfilled without a session id')
  const remoteSessionId = sessionId

  let diagnostic
  const result = settleRunResult({
    attempt: async () => {
      try {
        const promptResult = await Promise.race([
          agent.request(methods.agent.session.prompt, {
            sessionId: remoteSessionId,
            prompt: toAcpPrompt(request.prompt),
          }),
          cancelSettled.then(() => { throw new Error('subagent cancelled while the ACP prompt was running') }),
        ])
        const stopReason = acpStopReason(promptResult.stopReason)
        diagnostic = terminalFailure(promptResult.stopReason, latestPermission)
        return {
          output: collectOutput(),
          ...diagnostic === undefined ? {} : { diagnostic },
          stopReason,
        }
      } catch (error) {
        if (!flags.cancelled) {
          const outcome = await observeProcessOutcome(request.signal)
          const facts = outcome === undefined
            ? { stage: 'prompt', category: 'transport' }
            : { stage: 'process', category: 'process-exit', outcome }
          diagnostic = diagnosticText(facts, latestPermission)
        }
        throw processFailure ?? error
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
    id: parentNamespaceLifecycleId,
    result,
    signal: request.signal,
    onAbort,
    requestCancel,
    teardown: async () => {
      try {
        await disposeProcessOnce()
      } catch (error) {
        reportFailure(spec, error)
        throw new AcpRunFailure({
          stage: 'teardown',
          category: processOutcome === undefined ? 'unknown' : 'process-exit',
          ...processOutcome === undefined ? {} : { outcome: processOutcome },
        }, error)
      }
    },
  })
}
