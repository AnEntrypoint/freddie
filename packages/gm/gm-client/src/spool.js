/**
 * Raw gm spool protocol: write one verb dispatch to `.gm/exec-spool/in/`,
 * poll `.gm/exec-spool/out/` for the matching response. In-process, no MCP
 * stdio hop and no subprocess — the same file-based cycle gm-mcp itself
 * wraps, driven directly.
 * @module @freddie/freddie-gm-client/spool
 */

import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DEFAULT_POLL_INTERVAL_MS = 200
const DEFAULT_TIMEOUT_MS = 120_000

/**
 * One dispatch counter per session id, so concurrent calls under the same
 * session never collide on `<N>` — the daemon keys in-flight claims by the
 * literal `(verb, session_id-N)` pair with no further partition. The counter
 * alone is NOT enough to make `<N>` globally unique across process restarts
 * (a fresh process always starts back at 1) — see `dispatchKey` below, which
 * folds in a process-start timestamp for exactly that reason.
 */
const dispatchCounters = new Map()

/**
 * A value fixed once per process start (module load), distinguishing this
 * process's dispatch keys from any other process (past or concurrent) using
 * the same `sessionId` against the same project. `Date.now()` at import time
 * is enough entropy for this purpose — collision would require two processes
 * starting in the same millisecond AND sharing a `sessionId` AND racing the
 * same `<N>`, which the per-process counter already rules out for the third
 * condition.
 */
const processEpoch = Date.now()

function nextDispatchNumber(sessionId) {
  const current = dispatchCounters.get(sessionId) ?? 0
  const next = current + 1
  dispatchCounters.set(sessionId, next)
  return next
}

/**
 * Dispatch one gm spool verb and wait for its response.
 *
 * A dispatch key is `<sessionId>-<processEpoch>-<N>`, not bare
 * `<sessionId>-<N>` — the counter alone resets to 1 on every fresh process,
 * so two processes sharing a `sessionId` (or the same process restarted)
 * would otherwise both claim `sessionId-1` and could read back a STALE
 * out-file left over from a previous run at that same key (live-verified:
 * a planted stale `.ready` sentinel was read as a real response in 8ms,
 * without the daemon ever running). This function also unconditionally
 * removes any pre-existing out-file/`.ready` for its own key before writing
 * the in-file, as defense in depth against exactly that class of collision.
 * @param options.cwd - project root containing `.gm/exec-spool`.
 * @param options.verb - gm spool verb name.
 * @param options.sessionId - gm SESSION_ID; threaded into the body automatically.
 * @param options.body - JSON body (session_id is added if not already present).
 * @param options.timeoutMs - give up and throw after this many ms (default 120000).
 * @param options.pollIntervalMs - poll cadence while waiting (default 200).
 * @returns the parsed response body.
 * @throws when the spool directory is missing, or the dispatch times out.
 */
export async function dispatch({
  cwd,
  verb,
  sessionId,
  body = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}) {
  const spoolDir = join(cwd, '.gm', 'exec-spool')
  const inDir = join(spoolDir, 'in', verb)
  const outDir = join(spoolDir, 'out')
  const n = nextDispatchNumber(sessionId)
  const dispatchKey = `${sessionId}-${processEpoch}-${n}`
  const inPath = join(inDir, `${dispatchKey}.txt`)
  const outPath = join(outDir, `${verb}-${dispatchKey}.json`)
  const readyPath = `${outPath}.ready`

  await mkdir(inDir, { recursive: true })
  // Defense in depth against a stale response at this exact key -- the
  // processEpoch already makes a genuine collision implausible, but a
  // leftover file (e.g. from an aborted prior run using the SAME epoch,
  // such as a process that crashed and restarted within the same
  // millisecond, or a filesystem that failed to clean up) must never be
  // mistaken for this dispatch's real answer.
  await unlink(outPath).catch(() => {})
  await unlink(readyPath).catch(() => {})
  const payload = { ...body, session_id: body.session_id ?? sessionId }
  await writeFile(inPath, JSON.stringify(payload), 'utf8')

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await exists(readyPath)) {
      const text = await readFile(outPath, 'utf8')
      await unlink(readyPath).catch(() => {})
      return JSON.parse(text)
    }
    await sleep(pollIntervalMs)
  }
  throw new Error(`gm spool: dispatch "${verb}" (${dispatchKey}) timed out after ${timeoutMs}ms — in=${inPath} out=${outPath}`)
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
