import { accessSync, constants, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

/**
 * A subagent run's terminal outcome. Never rejects after {@link SubagentRun}
 * publication; a `stopReason` other than `'completed'` marks a non-fatal
 * ending the seam can represent.
 * @typedef {object} SubagentResult
 * @property {Array<object>} output - the child's final model-facing content.
 * @property {unknown} [structured] - present when the request declared an
 * `outputSchema` and the child produced a matching value.
 * @property {string} [diagnostic] - safe, size-limited provider-added detail
 * for a non-completed result; never tool inputs, file contents, environment
 * values, credentials, or raw protocol payloads.
 * @property {'completed' | 'aborted' | 'max-tokens' | 'refusal' | 'error'} stopReason
 */

/**
 * The holder-owned run handle a provider's `start()` fulfills with, published
 * only once the real child (in-process Agent or out-of-process handle)
 * exists. The caller owns it afterwards and must call `dispose()` on every
 * path.
 * @typedef {object} SubagentRun
 * @property {string} id - the shared session id (local) or a parent-scoped
 * lifecycle id (remote).
 * @property {object} [localAgent] - the exact child Agent for a local run;
 * `undefined` for an out-of-process run.
 * @property {Promise<SubagentResult>} result - never rejects after publication.
 * @property {function(): Promise<void>} dispose - idempotent teardown.
 */

const MAX_SUBAGENT_DIAGNOSTIC_BYTES = 4_096

const DIAGNOSTIC_TRUNCATION_SUFFIX = '\n[diagnostic truncated]'
const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder()

function limitSubagentDiagnostic(diagnostic) {
  const bytes = utf8Encoder.encode(diagnostic)
  if (bytes.byteLength <= MAX_SUBAGENT_DIAGNOSTIC_BYTES) return diagnostic

  const suffixBytes = utf8Encoder.encode(DIAGNOSTIC_TRUNCATION_SUFFIX).byteLength
  let prefixBytes = MAX_SUBAGENT_DIAGNOSTIC_BYTES - suffixBytes
  while (((bytes[prefixBytes]) & 0b1100_0000) === 0b1000_0000) {
    prefixBytes -= 1
  }
  return utf8Decoder.decode(bytes.subarray(0, prefixBytes))
    + DIAGNOSTIC_TRUNCATION_SUFFIX
}

export const NO_START_CAPABILITIES = Object.freeze({
  outputSchema: false,
  depthLimit: false,
  toolFilter: false,
  persona: false,
})

export function assertPositiveFinite(prefix, name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${prefix}: ${name} must be a positive finite number`)
  }
}

function isEnterableDirectory(path) {
  try {
    if (!statSync(path).isDirectory()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function assertUsableCwd(prefix, label, cwd) {
  if (!isAbsolute(cwd)) {
    throw new Error(`${prefix}: ${label} must be an absolute path: ${cwd}`)
  }
  if (!isEnterableDirectory(cwd)) {
    throw new Error(`${prefix}: ${label} is not an accessible directory: ${cwd}`)
  }
  return cwd
}

export function validateConfiguredCwd(prefix, cwd) {
  if (cwd === undefined) return undefined
  if (cwd === '') {
    throw new Error(`${prefix}: config cwd must not be empty — omit the key to inherit the parent session cwd`)
  }
  return assertUsableCwd(prefix, 'config cwd', resolve(cwd))
}

export function resolveChildCwd(prefix, configured, parentCwd) {
  if (configured !== undefined) return configured
  if (parentCwd === undefined) {
    throw new Error(`${prefix}: no working directory for the child — configure \`cwd\` or delegate from a parent session that has one`)
  }
  return assertUsableCwd(prefix, 'parent session cwd', parentCwd)
}

function toError(value) {
  /* v8 ignore next */
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * Inputs to {@link settleRunResult}.
 * @typedef {object} SettleRunResultParts
 * @property {function(): Promise<SubagentResult>} attempt - the provider's own attempt.
 * @property {function(): boolean} cancelled - whether cancellation already settled locally.
 * @property {function(): Array<object>} collectOutput - the best-effort output snapshot.
 * @property {function(Error, string): void} [onError] - reports an uncaught failure.
 * @property {function(): (string|undefined)} [collectDiagnostic] - unsafe raw
 * diagnostic text, limited before it reaches the result.
 * @property {AbortSignal} signal
 * @property {function} onAbort - the listener removed on every settlement path.
 */

export async function settleRunResult(parts) {
  try {
    const result = await parts.attempt()
    return parts.cancelled()
      ? { output: parts.collectOutput(), stopReason: 'aborted' }
      : result
  } catch (error) {
    if (parts.cancelled()) return { output: parts.collectOutput(), stopReason: 'aborted' }
    try {
      parts.onError?.(toError(error), 'error')
    } catch {
    }
    const collected = parts.collectDiagnostic?.()
    const diagnostic = collected === undefined
      ? undefined
      : limitSubagentDiagnostic(collected)
    return {
      output: parts.collectOutput(),
      ...diagnostic === undefined ? {} : { diagnostic },
      stopReason: 'error',
    }
  } finally {
    parts.signal.removeEventListener('abort', parts.onAbort)
  }
}

/**
 * Inputs to {@link subprocessRunHandle}.
 * @typedef {object} SubprocessRunHandleParts
 * @property {string} id
 * @property {Promise<SubagentResult>} result
 * @property {AbortSignal} signal
 * @property {function} onAbort
 * @property {function(): void} requestCancel - request local cancellation.
 * @property {function(): Promise<void>} teardown - await the backend to actual exit.
 */

export function subprocessRunHandle(parts) {
  let disposal
  return {
    id: parts.id,
    localAgent: undefined,
    result: parts.result,
    dispose() {
      if (disposal !== undefined) return disposal
      parts.signal.removeEventListener('abort', parts.onAbort)
      parts.requestCancel()
      disposal = parts.teardown()
      return disposal
    },
  }
}
