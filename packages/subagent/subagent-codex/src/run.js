/**
 * One-shot Codex child lifecycle: spawn the real app-server through the
 * subprocess seam, publish only after initialization and ephemeral thread
 * creation, flatten post-publication failures, and dispose to whole-range
 * quiescence.
 */

import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { SessionId } from '@freddie/freddie-session'
import {
  settleRunResult,
  subprocessRunHandle,
} from '@freddie/freddie-subagent'
import { CodexAppServerWire } from './wire.js'

/** Default POSIX grace between subprocess termination tiers. */
export const DEFAULT_DISPOSE_GRACE_MS = 3_000

const codexPackageJsonPath = createRequire(import.meta.url).resolve('@openai/codex/package.json')
const codexPackageManifest = createRequire(import.meta.url)('@openai/codex/package.json')

/** Absolute package-local JavaScript wrapper selected by the package manifest. */
const CODEX_PACKAGE_BIN = resolve(dirname(codexPackageJsonPath), codexPackageManifest.bin.codex)

/** Profile-selectable non-interactive Codex permission mode. */
export const CODEX_PERMISSION_MODES = [
  'never',
  'approve-for-me',
  'dangerously-bypass-approvals-and-sandbox',
]

/** Safe default for unattended Codex runs. */
export const DEFAULT_CODEX_PERMISSION_MODE = 'never'

function failureDiagnostic(facts) {
  const fields = [
    'product: Codex',
    `stage: ${facts.stage}`,
    `category: ${facts.category}`,
  ]
  if (facts.httpStatus !== undefined) {
    fields.push(`HTTP status: ${facts.httpStatus}`)
  }
  const processFields = [
    ['exit code', facts.outcome?.exitCode],
    ['signal', facts.outcome?.signal],
  ]
  for (const [label, value] of processFields) {
    if (value !== null && value !== undefined) fields.push(`${label}: ${value}`)
  }
  return `Product subagent failure (${fields.join('; ')})`
}

class CodexRunFailure extends Error {
  constructor(facts, cause) {
    super(`subagent-codex: ${failureDiagnostic(facts)}`, cause === undefined ? undefined : { cause })
    this.name = 'CodexRunFailure'
    this.facts = facts
  }
}

/**
 * Hide an unpublished Host failure behind fixed safe startup facts.
 * @param cause - original Host failure retained for internal diagnostics.
 * @returns a startup failure whose message contains only fixed safe facts.
 */
export function codexStartupFailure(cause) {
  return new CodexRunFailure({ stage: 'initialize', category: 'unknown' }, cause)
}

/**
 * Fixed package-local app-server command, independent of the host `PATH`.
 * @returns Node, the official wrapper, and the fixed app-server arguments.
 */
export function codexAppServerArgv() {
  return [process.execPath, CODEX_PACKAGE_BIN, 'app-server', '--stdio']
}

function thrown(value) {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * Validate and preserve the one-shot task before crossing the process boundary.
 * @param prompt - task content accepted from the shared subagent service.
 * @returns the exact non-empty text block sequence.
 */
export function textTask(prompt) {
  if (prompt.length === 0) {
    throw new Error('subagent-codex: the one-shot task must contain only text blocks')
  }
  const texts = []
  for (const block of prompt) {
    if (block.type !== 'text') {
      throw new Error('subagent-codex: the one-shot task must contain only text blocks')
    }
    texts.push(block.text)
  }
  if (texts.every(text => text.trim().length === 0)) {
    throw new Error('subagent-codex: the one-shot task must not be empty')
  }
  return texts
}

/**
 * Close the private wire, terminate the managed range, and wait for the
 * subprocess owner to prove it is quiescent.
 * @param wire - private app-server protocol connection.
 * @param child - shared-service handle that owns the managed range.
 */
export async function disposeCodexChild(wire, child) {
  wire.close()

  let outcome
  void child.done.then(
    (value) => { outcome = value },
    () => {},
  )
  try {
    child.stdin?.end()
  } catch {
  }
  child.terminate()
  try {
    await child.waitForExit()
  } catch (error) {
    throw new CodexRunFailure({ stage: 'teardown', category: 'unknown', outcome }, thrown(error))
  }
  await child.done.catch(() => {})
}

/**
 * Start the real `codex app-server --stdio` child and publish its one-shot run.
 * @param request - resolved shared subagent request.
 * @param spec - workspace, environment, process service, and diagnostic policy.
 * @returns the published run after initialization and ephemeral thread creation.
 */
export async function startCodexRun(request, spec) {
  const texts = textTask(request.prompt)
  if (request.signal.aborted) {
    throw new Error('subagent-codex: request was aborted before app-server startup')
  }

  let child
  try {
    child = spec.spawn({
      argv: codexAppServerArgv(),
      cwd: spec.cwd,
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
      graceMs: spec.disposeGraceMs,
      env: spec.env,
    })
  } catch (error) {
    throw new CodexRunFailure({ stage: 'initialize', category: 'unknown' }, thrown(error))
  }

  const wire = new CodexAppServerWire(child.stdout, child.stdin, spec.permissionMode, spec.model)
  const onStderr = (chunk) => {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    try {
      writeFileSync(process.stderr.fd, bytes)
    } catch {
    }
  }
  const onStderrError = () => {
  }
  child.stderr?.on('data', onStderr)
  child.stderr?.on('error', onStderrError)
  const disposeProcess = async () => {
    try {
      await disposeCodexChild(wire, child)
      await new Promise((resolveTick) => { setImmediate(resolveTick) })
    } finally {
      child.stderr?.off('data', onStderr)
      child.stderr?.off('error', onStderrError)
    }
  }

  let processFailureFacts
  const processFailure = child.done.then(
    (outcome) => {
      processFailureFacts = { stage: 'process', category: 'process', outcome }
      throw new CodexRunFailure(processFailureFacts)
    },
    (error) => {
      processFailureFacts = { stage: 'process', category: 'unknown' }
      throw new CodexRunFailure(processFailureFacts, thrown(error))
    },
  )
  processFailure.catch(() => {})

  const runAbort = new AbortController()
  const requestCancel = () => {
    if (runAbort.signal.aborted) return
    runAbort.abort(new Error('subagent-codex: run cancelled locally'))
    wire.interrupt()
  }
  const onAbort = () => { requestCancel() }
  request.signal.addEventListener('abort', onAbort, { once: true })

  let startupStage = 'initialize'
  try {
    wire.start()
    await Promise.race([wire.initialize(request.signal), processFailure])
    startupStage = 'thread-start'
    await Promise.race([wire.startThread(spec.cwd, request.signal), processFailure])
  } catch (error) {
    request.signal.removeEventListener('abort', onAbort)
    const cancelledBeforeCleanup = runAbort.signal.aborted
    if (!(error instanceof CodexRunFailure) && !cancelledBeforeCleanup) {
      await new Promise((resolveTick) => { setImmediate(resolveTick) })
    }
    const failure = new CodexRunFailure({
      stage: startupStage,
      category: 'unknown',
      outcome: error instanceof CodexRunFailure ? error.facts.outcome : processFailureFacts?.outcome,
    }, thrown(error))
    try {
      await disposeProcess()
    } catch (disposeError) {
      const cleanupFailure = thrown(disposeError)
      throw new AggregateError([failure, cleanupFailure], `${failure.message}; ${cleanupFailure.message}`)
    }
    if (cancelledBeforeCleanup) {
      throw new Error('subagent-codex: request was aborted before run publication')
    }
    try {
      request.signal.throwIfAborted()
    } catch {
      throw new Error('subagent-codex: request was aborted before run publication')
    }
    throw failure
  }

  const collectOutput = () => wire.collectOutput()
  let diagnostic
  const recordFailureDiagnostic = (facts) => {
    const failure = failureDiagnostic(facts)
    const permission = wire.collectDiagnostic()
    diagnostic = permission === undefined ? failure : `${failure}\n${permission}`
    return diagnostic
  }
  const withProcessOutcome = (facts) => {
    const outcome = processFailureFacts?.outcome
    return outcome === undefined ? facts : { ...facts, outcome }
  }
  const publishedProcessFailure = processFailure.catch(async (error) => {
    await new Promise((resolveTick) => { setImmediate(resolveTick) })
    throw error
  })
  const result = settleRunResult({
    attempt: async () => {
      try {
        const terminal = await Promise.race([
          wire.runTurn(texts, runAbort.signal),
          publishedProcessFailure,
        ])
        if (terminal.stopReason === 'completed') return terminal
        await new Promise((resolveTick) => { setImmediate(resolveTick) })
        const facts = withProcessOutcome(wire.collectFailure())
        return { ...terminal, diagnostic: recordFailureDiagnostic(facts) }
      } catch (error) {
        await new Promise((resolveTick) => { setImmediate(resolveTick) })
        const endedBeforeTerminal = wire.endedBeforeTerminal()
        if (endedBeforeTerminal && processFailureFacts === undefined && !runAbort.signal.aborted) {
          try {
            const exited = await child.waitForExit(AbortSignal.timeout(Math.ceil(spec.disposeGraceMs)))
            if (exited) await child.done
          } catch {
          }
        }
        const facts = error instanceof CodexRunFailure
          ? error.facts
          : endedBeforeTerminal && processFailureFacts !== undefined
            ? processFailureFacts
            : withProcessOutcome(wire.collectFailure())
        recordFailureDiagnostic(facts)
        throw error instanceof CodexRunFailure ? error : new CodexRunFailure(facts, thrown(error))
      }
    },
    collectOutput,
    collectDiagnostic: () => diagnostic,
    cancelled: () => runAbort.signal.aborted,
    onError: spec.onError,
    signal: request.signal,
    onAbort,
  })

  return subprocessRunHandle({
    id: SessionId(randomUUID()),
    result,
    signal: request.signal,
    onAbort,
    requestCancel,
    teardown: disposeProcess,
  })
}
