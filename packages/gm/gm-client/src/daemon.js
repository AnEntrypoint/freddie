/**
 * Shared gm daemon lifecycle: attach to the already-running, machine-wide
 * `agentplug-runner` if one is live, otherwise spawn
 * `~/.gm-tools/agentplug-runner spool` — the same fire-and-forget
 * registration gm-mcp and gm's own skill use. That native host loads
 * `gm.wasm` with `host_plugin_call`. The retired JS wrapper at
 * `~/.gm-tools/plugkit-wasm-wrapper.js` does not, so a boot that spawned it
 * never wrote `.status.json`.
 * @module @freddie/freddie-gm-client/daemon
 */

import { access, readFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

/** Daemon considered dead if `.status.json`'s `ts` is older than this. */
const STALE_MS = 5 * 60 * 1000

/**
 * A live pid whose `.status.json` `ts` has not moved for this long is hung:
 * the process exists but is not consuming the spool. Shorter than {@link STALE_MS}
 * so a dispatch poll fails fast instead of waiting the remaining timeout.
 */
export const HUNG_MS = 4 * 60 * 1000

/** How long to poll for real readiness after a boot attempt before giving up. */
const BOOT_READY_TIMEOUT_MS = 45_000
const BOOT_READY_POLL_INTERVAL_MS = 500

/**
 * In-flight boot promise per `cwd`, so concurrent `ensureDaemon` calls
 * against the same project share one boot attempt instead of each spawning
 * its own daemon process (live-verified: three concurrent calls against a
 * dead daemon spawned three separate processes, all reporting success,
 * zero surviving — a thundering herd, not a corruption, but still wrong).
 * Cleared once the in-flight attempt settles (success or failure) so a
 * later, genuinely new boot attempt isn't wedged behind a stale promise.
 */
const inFlightBoots = new Map()

/**
 * Read `.gm/exec-spool/.status.json` if present.
 * @param cwd - project root.
 * @returns the parsed status, or undefined if absent/unreadable.
 */
export async function readStatus(cwd) {
  try {
    const text = await readFile(join(cwd, '.gm', 'exec-spool', '.status.json'), 'utf8')
    return JSON.parse(text)
  } catch (error) {
    // ENOENT: the daemon has not written status yet. SyntaxError: a partial
    // write is not a live status. Any other syscall is unexpected.
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

/**
 * Whether the daemon looks alive: a `.status.json` with a fresh `ts` AND a
 * live process at its recorded `pid`. `ts` freshness alone (the gm skill's
 * own documented "dead watcher" signal) has a real blind spot for a daemon
 * killed moments ago — the file isn't rewritten on process death, so a
 * timestamp minutes old still reads "fresh" against a five-minute window.
 * A `process.kill(pid, 0)` liveness probe (signal 0: existence check, no
 * actual signal delivered) closes that gap cheaply.
 * @param cwd - project root.
 * @returns true when a recent status file exists and its pid is running.
 */
export async function isDaemonAlive(cwd) {
  const status = await readStatus(cwd)
  if (status === undefined || typeof status.ts !== 'number') return false
  if (typeof status.pid === 'number') {
    try {
      process.kill(status.pid, 0)
      return true
    } catch (error) {
      // ESRCH: pid is gone. EPERM: pid exists but this process cannot signal it
      // — still alive. Windows Node often omits ESRCH for a missing pid.
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

/**
 * Machine-wide daemon heartbeat path: `AGENTPLUG_HOME/daemon-status.json`, else
 * `~/.agentplug/daemon-status.json`. Distinct from the per-project
 * `.gm/exec-spool/.status.json`.
 * @returns the absolute path.
 */
export function daemonStatusPath() {
  const home = process.env.AGENTPLUG_HOME
  if (typeof home === 'string' && home.length > 0) return join(home, 'daemon-status.json')
  return join(homedir(), '.agentplug', 'daemon-status.json')
}

/**
 * Read the machine-wide heartbeat if present.
 * @returns the parsed object, or undefined when absent/unreadable.
 */
export async function readDaemonStatus() {
  try {
    const text = await readFile(daemonStatusPath(), 'utf8')
    return JSON.parse(text)
  } catch (error) {
    // ENOENT: no machine-wide heartbeat yet. SyntaxError: a partial write.
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

/**
 * Classify why a project `.status.json` looks stale while a pid may still exist.
 * @param cwd - project root.
 * @returns `'fresh'` | `'busy'` | `'project-heartbeat-stale'` | `'daemon-status-stale'` | `'dead'`
 */
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

/**
 * Whether a still-running daemon has stopped writing `.status.json`.
 * Distinct from {@link isDaemonAlive}: a hung pid still answers `kill(pid, 0)`.
 * A future `busy_until` licenses waiting even when `ts` is older than {@link HUNG_MS}.
 * @param cwd - project root.
 * @returns true when the project ticker is stale, the pid is alive, and no future busy_until applies.
 */
export async function isDaemonHung(cwd) {
  const kind = await classifyDaemonHealth(cwd)
  return kind === 'project-heartbeat-stale' || kind === 'daemon-status-stale'
}

/**
 * Ensure the shared gm daemon is running for `cwd`, spawning
 * `~/.gm-tools/agentplug-runner spool` when it isn't already alive. A no-op
 * when the daemon already answers fresh. `spool` registers the project with
 * the shared native daemon and starts that daemon if needed; it does not
 * start the JS wasm wrapper.
 *
 * Two failure modes closed after live adversarial testing found them real:
 * (1) `spawn()` handing back a pid does not mean the runner came up. This
 * function polls `isDaemonAlive` after spawn, up to `BOOT_READY_TIMEOUT_MS`,
 * and throws if the daemon never writes a live `.status.json`. (2) Concurrent
 * callers against a dead daemon each spawned their own process — `inFlightBoots`
 * makes every concurrent call for the same `cwd` await one shared boot attempt.
 * @param cwd - project root that will own the `.gm/exec-spool` dispatch.
 * @returns `{ alreadyRunning }` after boot completes or is skipped.
 * @throws when `~/.gm-tools/agentplug-runner` is missing, or the daemon fails to become ready within `BOOT_READY_TIMEOUT_MS` of a boot attempt.
 */
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
