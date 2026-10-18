import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, mkdtempSync, openSync, unlinkSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleepMs } from 'node:timers/promises'
import { scrubbedParentEnv } from '@freddie/freddie-subprocess'
import { MAX_TIMER_DELAY_MS } from '@freddie/freddie-timeout'
import { linuxProcessGroupHasLiveMembers } from './process-inspector.js'

const SPAWN_FAILED_PID = -1

export function childEnv(extra) {
  const env = scrubbedParentEnv()
  if (process.platform !== 'win32') return { ...env, ...extra }
  let entries = Object.entries(env)
  for (const [key, value] of Object.entries(extra ?? {})) {
    const normalized = key.toUpperCase()
    entries = entries.filter(([inherited]) => inherited.toUpperCase() !== normalized)
    entries.push([key, value])
  }
  return Object.fromEntries(entries)
}



function sleepTick() {
  return sleepMs(15)
}

let spillCounter = 0
let defaultSpillDir

function privateSpillDir() {
  defaultSpillDir ??= mkdtempSync(join(tmpdir(), 'freddie-subprocess-'))
  return defaultSpillDir
}

export class OutputCollector {
  chunks = []
  bytes = 0
  dropped = false
  spillFd
  spillFile
  spillDisabled
  total = 0

  constructor(maxBytes, maxSpillBytes, label, spillDir) {
    this.maxBytes = maxBytes
    this.maxSpillBytes = maxSpillBytes
    this.label = label
    this.spillDir = spillDir
    this.spillDisabled = maxSpillBytes === undefined
  }

  push(chunk) {
    this.total += chunk.length
    const overflows = this.bytes + chunk.length > this.maxBytes
    if (!this.spillDisabled && (overflows || this.spillFd !== undefined)) this.spillAll(chunk)
    this.chunks.push(chunk)
    this.bytes += chunk.length
    while (this.bytes > this.maxBytes) {
      const head = this.chunks[0]
      const excess = this.bytes - this.maxBytes
      if (head.length <= excess) {
        this.chunks.shift()
        this.bytes -= head.length
      } else {
        this.chunks[0] = head.subarray(excess)
        this.bytes -= excess
      }
      this.dropped = true
    }
  }

  spillAll(chunk) {
    if (this.maxSpillBytes !== undefined && this.total > this.maxSpillBytes) {
      this.discardSpill()
      return
    }
    if (this.spillFd === undefined) {
      this.spillFile = join(
        this.spillDir,
        `freddie-subprocess-${process.pid}-${++spillCounter}-${randomBytes(6).toString('hex')}-${this.label}.log`,
      )
      this.spillFd = openSync(this.spillFile, 'wx', 0o600)
      for (const prior of this.chunks) writeSync(this.spillFd, prior)
    }
    writeSync(this.spillFd, chunk)
  }

  discardSpill() {
    const fd = this.spillFd
    const file = this.spillFile
    this.spillFd = undefined
    this.spillFile = undefined
    this.spillDisabled = true
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        this.spillFd = fd
      }
    }
    if (file !== undefined) {
      try {
        unlinkSync(file)
      } catch {
      }
    }
  }

  readFrom(fromByte) {
    const windowStart = this.total - this.bytes
    const buffer = Buffer.concat(this.chunks)
    const lossy = fromByte < windowStart
    const slice = lossy ? buffer : buffer.subarray(fromByte - windowStart)
    return {
      text: slice.toString('utf8'),
      nextOffset: this.total,
      lossy,
      ...this.spillFile !== undefined ? { spillPath: this.spillFile } : {},
    }
  }

  seal() {
    if (this.spillFd === undefined) return
    try {
      closeSync(this.spillFd)
    } catch {
      this.spillFile = undefined
    }
    this.spillFd = undefined
  }

  finalize() {
    this.seal()
    return {
      text: Buffer.concat(this.chunks).toString('utf8'),
      truncated: this.dropped,
      ...this.spillFile !== undefined ? { spillPath: this.spillFile } : {},
    }
  }
}

export function killGroup(pid, sig) {
  if (pid <= 0) return
  try {
    process.kill(-pid, sig)
  } catch {
  }
}

export function taskkillProcessTree(pid) {
  if (pid <= 0) return
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
}

function signalTree(platform, pid, sig, child, taskkill) {
  if (platform === 'win32') {
    taskkill(pid)
    return
  }
  if (pid <= 0) return
  try {
    process.kill(-pid, sig)
  } catch {
    try {
      child.kill(sig)
    } catch {
    }
  }
}

export function spawnSubprocess(spec, internals = {}) {
  if (!Number.isFinite(spec.graceMs) || spec.graceMs <= 0 || spec.graceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`subprocess graceMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  const spillDir = internals.spillDir ?? privateSpillDir()
  const platform = internals.platform ?? process.platform
  const taskkill = internals.taskkill ?? taskkillProcessTree
  const linuxGroupHasLiveMembers = internals.linuxProcessGroupHasLiveMembers ?? linuxProcessGroupHasLiveMembers

  if (spec.signal?.aborted) {
    throw new Error(`aborted before spawn: ${String(spec.signal.reason ?? 'aborted')}`)
  }
  const [program, ...args] = spec.argv
  if (program === undefined || program.length === 0) {
    throw new Error('invalid argv: expected a non-empty program name at argv[0]')
  }

  const isCollect = mode => mode !== 'pipe' && mode !== 'inherit'
  const outMode = spec.stdio.stdout
  const errMode = spec.stdio.stderr
  const stdinMode = spec.stdio.stdin

  const env = childEnv(spec.env)
  const child = spawn(program, args, {
    cwd: spec.cwd,
    env,
    stdio: [
      stdinMode === 'ignore' ? 'ignore' : 'pipe',
      outMode === 'inherit' ? 'inherit' : 'pipe',
      errMode === 'inherit' ? 'inherit' : 'pipe',
    ],
    detached: platform !== 'win32',
  })

  const collectStream = (mode, stream, label) => {
    if (!isCollect(mode) || stream === null) return undefined
    const collector = new OutputCollector(mode.maxBytes, mode.spill?.maxBytes, label, spillDir)
    stream.on('data', (chunk) => { collector.push(chunk) })
    return collector
  }
  const stdoutCollector = collectStream(outMode, child.stdout, 'stdout')
  const stderrCollector = collectStream(errMode, child.stderr, 'stderr')

  let graceTimer
  let treeExitObserved = false
  let treeExitObservation
  let settled = false

  const pid = child.pid ?? SPAWN_FAILED_PID

  const treeAlive = () => {
    if (treeExitObserved) return false
    if (pid <= 0) return false
    if (platform === 'win32') {
      return child.exitCode === null && child.signalCode === null
    }
    try {
      process.kill(-pid, 0)
      if (settled && platform === 'linux' && linuxGroupHasLiveMembers(pid) === false) return false
      return true
    } catch (error) {
      const code = error.code
      if (code === 'ESRCH') return false
      if (code === 'EPERM') return true
      return child.exitCode === null && child.signalCode === null
    }
  }

  const observeTreeExit = () => {
    treeExitObservation ??= (async () => {
      while (treeAlive()) await sleepTick()
      treeExitObserved = true
      if (graceTimer !== undefined) clearTimeout(graceTimer)
      graceTimer = undefined
    })()
    return treeExitObservation
  }

  const kill = (sig) => {
    if (!treeAlive()) return
    signalTree(platform, pid, sig, child, taskkill)
  }

  const terminate = () => {
    if (treeExitObserved || graceTimer !== undefined) return
    void observeTreeExit()
    if (treeExitObserved) return
    kill('SIGTERM')
    graceTimer = setTimeout(() => { kill('SIGKILL') }, spec.graceMs)
  }

  const terminateForHostExit = () => {
    kill('SIGKILL')
  }

  const onAbort = () => { terminate() }
  spec.signal?.addEventListener('abort', onAbort, { once: true })

  if (typeof stdinMode === 'object' && child.stdin !== null) {
    const ignoreStdinWriteError = () => {}
    child.stdin.on('error', ignoreStdinWriteError)
    child.stdin.end(stdinMode.data)
  }

  const done = new Promise((resolve, reject) => {
    let pipeDrainTimer
    const settle = (exitCode, signal) => {
      if (settled) return
      settled = true
      if (stdoutCollector !== undefined) child.stdout?.destroy()
      if (stderrCollector !== undefined) child.stderr?.destroy()
      stdoutCollector?.seal()
      stderrCollector?.seal()
      cleanup()
      resolve({ exitCode, signal })
    }
    child.on('error', (error) => {
      settled = true
      cleanup()
      reject(error)
    })
    child.on('exit', (exitCode, signal) => {
      pipeDrainTimer = setTimeout(() => {
        settle(exitCode, signal)
      }, spec.graceMs)
    })
    child.on('close', settle)
    function cleanup() {
      if (pipeDrainTimer !== undefined) clearTimeout(pipeDrainTimer)
      spec.signal?.removeEventListener('abort', onAbort)
    }
  })

  const waitForExit = async (signal) => {
    const observed = observeTreeExit()
    if (treeExitObserved) return true
    if (signal?.aborted) return false
    if (signal === undefined) {
      await observed
      return true
    }
    const aborted = Promise.withResolvers()
    const onAbort = () => { aborted.resolve(false) }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    try {
      return await Promise.race([observed.then(() => true), aborted.promise])
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  }

  return {
    pid,
    stdin: stdinMode === 'pipe' ? child.stdin ?? undefined : undefined,
    stdout: outMode === 'pipe' ? child.stdout ?? undefined : undefined,
    stderr: errMode === 'pipe' ? child.stderr ?? undefined : undefined,
    collected: {
      ...stdoutCollector !== undefined ? { stdout: stdoutCollector } : {},
      ...stderrCollector !== undefined ? { stderr: stderrCollector } : {},
    },
    done,
    terminate,
    terminateForHostExit,
    waitForExit,
  }
}
