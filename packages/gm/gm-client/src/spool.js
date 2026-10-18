import { watch } from 'node:fs'
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { classifyDaemonHealth, isDaemonAlive, readDaemonStatus, readStatus } from './daemon.js'

const DEFAULT_POLL_INTERVAL_MS = 25
const HEALTH_CHECK_AFTER_POLLS = 5
const DEFAULT_TIMEOUT_MS = 120_000

const dispatchCounters = new Map()

const processEpoch = Date.now()

export class GmDaemonUnavailableError extends Error {
  constructor(message, code, details) {
    super(message)
    this.name = 'GmDaemonUnavailableError'
    this.code = code
    Object.assign(this, details)
  }
}

function nextDispatchNumber(sessionId) {
  const current = dispatchCounters.get(sessionId) ?? 0
  const next = current + 1
  dispatchCounters.set(sessionId, next)
  return next
}

function isMissingPathError(error) {
  return error !== null && typeof error === 'object' && error.code === 'ENOENT'
}

async function projectHasQueuedWork(cwd) {
  const inRoot = join(cwd, '.gm', 'exec-spool', 'in')
  let verbs
  try {
    verbs = await readdir(inRoot, { withFileTypes: true })
  } catch (error) {
    if (isMissingPathError(error)) return false
    throw error
  }
  for (const verb of verbs) {
    if (!verb.isDirectory()) continue
    let files
    try {
      files = await readdir(join(inRoot, verb.name))
    } catch (error) {
      if (isMissingPathError(error)) continue
      throw error
    }
    if (files.some(name => name.endsWith('.inflight') || name.endsWith('.txt'))) return true
  }
  return false
}

function throwIfAborted(signal) {
  if (signal === undefined) return
  if (typeof signal.throwIfAborted === 'function') {
    signal.throwIfAborted()
    return
  }
  if (signal.aborted) {
    const reason = signal.reason ?? new Error('This operation was aborted')
    throw reason
  }
}

export async function dispatch({
  cwd,
  verb,
  sessionId,
  body = {},
  rawBody,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  signal,
}) {
  throwIfAborted(signal)
  const spoolDir = join(cwd, '.gm', 'exec-spool')
  const inDir = join(spoolDir, 'in', verb)
  const outDir = join(spoolDir, 'out')
  const n = nextDispatchNumber(sessionId)
  const dispatchKey = `${sessionId}-${processEpoch}-${n}`
  const inPath = join(inDir, `${dispatchKey}.txt`)
  const outPath = join(outDir, `${verb}-${dispatchKey}.json`)
  const readyPath = `${outPath}.ready`

  await mkdir(inDir, { recursive: true })
  await mkdir(outDir, { recursive: true })
  await unlink(outPath).catch((error) => {
    if (!isMissingPathError(error)) throw error
  })
  await unlink(readyPath).catch((error) => {
    if (!isMissingPathError(error)) throw error
  })
  const stagingPath = `${inPath}.tmp`
  const content = rawBody === undefined
    ? JSON.stringify({ ...body, session_id: body.session_id ?? sessionId })
    : rawBody
  await unlink(stagingPath).catch((error) => {
    if (!isMissingPathError(error)) throw error
  })
  try {
    await writeFile(stagingPath, content, 'utf8')
    await rename(stagingPath, inPath)
  } catch (error) {
    await unlink(stagingPath).catch((cleanupError) => {
      if (!isMissingPathError(cleanupError)) throw cleanupError
    })
    throw error
  }

  const deadline = Date.now() + timeoutMs
  const inflightPath = `${inPath}.inflight`
  const dropClaim = async () => {
    await unlink(inPath).catch((error) => {
      if (!isMissingPathError(error)) throw error
    })
    await unlink(inflightPath).catch((error) => {
      if (!isMissingPathError(error)) throw error
    })
  }
  const takeResponse = async () => {
    let text
    try {
      text = await readFile(outPath, 'utf8')
    } catch (error) {
      if (isMissingPathError(error)) return undefined
      throw error
    }
    let response
    try {
      response = JSON.parse(text)
    } catch (error) {
      if (error instanceof SyntaxError) return undefined
      throw error
    }
    await unlink(readyPath).catch((error) => {
      if (!isMissingPathError(error)) throw error
    })
    return { response }
  }
  const unavailable = async (code, health, queued) => {
    const [project, machine] = await Promise.all([readStatus(cwd), readDaemonStatus()])
    const machineAgeMs = typeof machine?.ts === 'number' ? Date.now() - machine.ts : undefined
    return new GmDaemonUnavailableError(
      `gm spool: daemon ${code === 'GM_DAEMON_DIED' ? 'died' : 'hung'} while waiting for "${verb}" (${dispatchKey})`,
      code,
      {
        health,
        queued,
        verb,
        dispatchKey,
        projectStatus: project === undefined ? undefined : {
          pid: project.pid,
          ts: project.ts,
          busyUntil: project.busy_until,
        },
        ...machineAgeMs === undefined ? {} : { machineHeartbeatAgeMs: machineAgeMs },
      },
    )
  }
  let polls = 0
  while (Date.now() < deadline) {
    throwIfAborted(signal)
    const cancelWait = new AbortController()
    const onUserAbort = () => { cancelWait.abort(signal.reason) }
    if (signal !== undefined) signal.addEventListener('abort', onUserAbort, { once: true })
    const wait = waitForOutOrTimeout(outDir, pollIntervalMs, cancelWait.signal)
      .then(() => undefined, error => ({ error }))
    try {
      const landed = await takeResponse()
      if (landed !== undefined) return landed.response
      polls += 1
      if (polls >= HEALTH_CHECK_AFTER_POLLS) {
        const queued = await projectHasQueuedWork(cwd)
        const alive = await isDaemonAlive(cwd)
        const health = await classifyDaemonHealth(cwd)
        const died = !alive && !queued
        const hung = health === 'project-heartbeat-stale' || health === 'daemon-status-stale'
        const completedWhileChecking = await takeResponse()
        if (completedWhileChecking !== undefined) return completedWhileChecking.response
        if (died) {
          await dropClaim()
          throw await unavailable('GM_DAEMON_DIED', health, queued)
        }
        if (hung && !queued) {
          await dropClaim()
          throw await unavailable('GM_DAEMON_HUNG', health, queued)
        }
      }
      const outcome = await wait
      if (outcome !== undefined) throw outcome.error
    } finally {
      if (signal !== undefined) signal.removeEventListener('abort', onUserAbort)
      cancelWait.abort()
      await wait
    }
  }
  await dropClaim()
  throw new Error(`gm spool: dispatch "${verb}" (${dispatchKey}) timed out after ${timeoutMs}ms — in=${inPath} out=${outPath}`)
}

function waitForOutOrTimeout(dir, ms, signal) {
  if (signal !== undefined && signal.aborted) {
    return Promise.reject(signal.reason ?? new Error('This operation was aborted'))
  }
  return new Promise((resolve, reject) => {
    let watcher
    let timer
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (watcher !== undefined) watcher.close()
      if (signal !== undefined) signal.removeEventListener('abort', onAbort)
      if (error === undefined) resolve()
      else reject(error)
    }
    const onAbort = () => {
      finish(signal.reason ?? new Error('This operation was aborted'))
    }
    try {
      watcher = watch(dir, { persistent: false }, () => finish())
      watcher.on('error', () => finish())
    } catch (error) {
      void error
      watcher = undefined
    }
    timer = setTimeout(() => finish(), ms)
    if (signal !== undefined) signal.addEventListener('abort', onAbort, { once: true })
  })
}
