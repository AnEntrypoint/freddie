import { access, readFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const STALE_MS = 5 * 60 * 1000

export const HUNG_MS = 4 * 60 * 1000

const BOOT_READY_TIMEOUT_MS = 45_000
const BOOT_READY_POLL_INTERVAL_MS = 500

const inFlightBoots = new Map()

export async function readStatus(cwd) {
  try {
    const text = await readFile(join(cwd, '.gm', 'exec-spool', '.status.json'), 'utf8')
    return JSON.parse(text)
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

export async function isDaemonAlive(cwd) {
  const status = await readStatus(cwd)
  if (status === undefined || typeof status.ts !== 'number') return false
  if (typeof status.pid === 'number') {
    try {
      process.kill(status.pid, 0)
      return true
    } catch (error) {
      if (error !== null && typeof error === 'object' && error.code === 'EPERM') return true
      if (error !== null && typeof error === 'object' && error.code === 'ESRCH') return false
      if (process.platform === 'win32') return false
      throw error
    }
  }
  const now = Date.now()
  const busy = typeof status.busy_until === 'number' && status.busy_until > now
  if (!busy && now - status.ts >= STALE_MS) return false
  return true
}

export function daemonStatusPath() {
  const home = process.env.AGENTPLUG_HOME
  if (typeof home === 'string' && home.length > 0) return join(home, 'daemon-status.json')
  return join(homedir(), '.agentplug', 'daemon-status.json')
}

export async function readDaemonStatus() {
  try {
    const text = await readFile(daemonStatusPath(), 'utf8')
    return JSON.parse(text)
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

export async function classifyDaemonHealth(cwd) {
  const status = await readStatus(cwd)
  if (status === undefined || typeof status.ts !== 'number') return 'dead'
  const now = Date.now()
  if (typeof status.busy_until === 'number' && status.busy_until > now) return 'busy'
  if (now - status.ts < HUNG_MS) return 'fresh'
  const alive = await isDaemonAlive(cwd)
  if (!alive) return 'dead'
  const machine = await readDaemonStatus()
  if (machine !== undefined && typeof machine.ts === 'number' && now - machine.ts < STALE_MS) {
    return 'project-heartbeat-stale'
  }
  return 'daemon-status-stale'
}

export async function isDaemonHung(cwd) {
  const kind = await classifyDaemonHealth(cwd)
  return kind === 'project-heartbeat-stale' || kind === 'daemon-status-stale'
}

export async function ensureDaemon(cwd) {
  if (await isDaemonAlive(cwd)) return { alreadyRunning: true }
  const shared = await readDaemonStatus()
  if (shared !== undefined && typeof shared.ts === 'number' && Date.now() - shared.ts < STALE_MS) {
    const deadline = Date.now() + BOOT_READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (await isDaemonAlive(cwd)) return { alreadyRunning: true }
      await sleep(BOOT_READY_POLL_INTERVAL_MS)
    }
  }

  const existing = inFlightBoots.get(cwd)
  if (existing !== undefined) return existing

  const attempt = bootAndAwaitReady(cwd).finally(() => {
    if (inFlightBoots.get(cwd) === attempt) inFlightBoots.delete(cwd)
  })
  inFlightBoots.set(cwd, attempt)
  return attempt
}

function runnerPath() {
  const name = process.platform === 'win32' ? 'agentplug-runner.exe' : 'agentplug-runner'
  return join(homedir(), '.gm-tools', name)
}

async function bootAndAwaitReady(cwd) {
  const binary = runnerPath()
  try {
    await access(binary, fsConstants.F_OK)
  } catch (error) {
    throw new Error(
      `gm-client: no gm installation found at ${binary} — install gm first (see https://github.com/AnEntrypoint/gm)`,
      { cause: error },
    )
  }
  let started
  try {
    started = spawn(binary, ['spool'], {
      cwd,
      env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    started.unref()
  } catch (error) {
    throw new Error(`gm-client: failed to start the gm daemon: ${error.message}`, { cause: error })
  }
  const deadline = Date.now() + BOOT_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await isDaemonAlive(cwd)) return { alreadyRunning: false, pid: started.pid }
    await sleep(BOOT_READY_POLL_INTERVAL_MS)
  }
  throw new Error(
    `gm-client: spawned the gm daemon (pid ${started.pid}) but it never became ready within ${BOOT_READY_TIMEOUT_MS}ms — check ${join(cwd, '.gm', 'exec-spool', '.watcher.log')} and ${join(homedir(), '.agentplug', 'daemon.log')}`,
  )
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
