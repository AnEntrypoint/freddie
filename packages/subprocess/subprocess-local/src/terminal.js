/** Local node-pty terminal-process implementation for the subprocess seam. */

import { Buffer } from 'node:buffer'
import { constants } from 'node:os'
import { PassThrough } from 'node:stream'

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function signalName(number) {
  if (number === undefined || number === 0) return null
  for (const [name, value] of Object.entries(constants.signals)) {
    if (value === number) return name
  }
  return null
}

/**
 * A local terminal whose process-session ownership stays below the PTY backend.
 * The seam's terminate() promise — no write, inspection, or signal in flight
 * after settlement — holds here only because every handle call completes
 * synchronously under the hood (node-pty write, ps-based inspection). A first
 * genuinely asynchronous step in any handle call must add the tracking a
 * remote provider needs.
 * @implements {import('@freddie/freddie-subprocess').SubprocessTerminalHandle}
 */
export class LocalTerminalHandle {
  pid
  output = new PassThrough()
  done

  outcome = Promise.withResolvers()
  dataDisposable
  exitDisposable
  cleanup
  exited = false
  trackedDescendants = []
  /** The spawned shell's start identity; scans stop adopting members once the root pid no longer carries it. */
  rootIdentity

  /**
   * @param terminal - allocated node-pty process.
   * @param inspector - platform process/session operations.
   * @param graceMs - TERM-to-KILL and exit-wait grace.
   * @param platform - host platform; defaults to the running platform, injectable for deterministic tests.
   */
  constructor(terminal, inspector, graceMs, platform = process.platform) {
    this.terminal = terminal
    this.inspector = inspector
    this.graceMs = graceMs
    this.platform = platform
    this.pid = terminal.pid
    this.rootIdentity = inspector.processTree(this.pid).find(member => member.pid === this.pid)
    this.done = this.outcome.promise
    this.dataDisposable = terminal.onData((data) => { this.output.write(Buffer.from(data, 'utf8')) })
    this.exitDisposable = terminal.onExit(({ exitCode, signal: exitSignal }) => {
      if (this.exited) return
      this.exited = true
      this.output.end()
      this.outcome.resolve({
        exitCode: exitSignal === undefined || exitSignal === 0 ? exitCode : null,
        signal: signalName(exitSignal),
      })
    })
  }

  // oxlint-disable-next-line typescript/require-await -- Preserve promise rejection semantics at the async provider contract.
  async write(data) {
    if (this.exited) throw new Error('terminal process has exited')
    this.terminal.write(data)
  }

  // oxlint-disable-next-line typescript/require-await -- Preserve promise rejection semantics at the async provider contract.
  async resize(cols, rows) {
    if (this.exited) throw new Error('terminal process has exited')
    if (!Number.isSafeInteger(cols) || cols <= 0 || !Number.isSafeInteger(rows) || rows <= 0) {
      throw new Error('terminal dimensions must be positive safe integers')
    }
    this.terminal.resize(cols, rows)
  }

  // oxlint-disable-next-line typescript/require-await -- Preserve promise rejection semantics at the async provider contract.
  async inspectForeground() {
    this.descendants()
    const processGroupId = this.inspector.foregroundPgid(this.pid)
    if (processGroupId === undefined) return undefined
    return {
      processGroupId,
      inputWaiting: this.inspector.isStdinWaiting(processGroupId),
    }
  }

  async signalForeground(signal) {
    const foreground = await this.inspectForeground()
    if (foreground === undefined) {
      throw new Error(`cannot resolve foreground process group for terminal ${this.pid}`)
    }
    if (signal === 'SIGKILL' && foreground.processGroupId === this.pid) {
      throw new Error('refusing to SIGKILL the terminal shell; terminate the terminal session instead')
    }
    if (this.platform === 'win32') {
      if (signal === 'SIGINT') {
        this.terminal.write('\x03')
        return foreground.processGroupId
      }
      if (signal === 'SIGTSTP' || signal === 'SIGHUP') {
        throw new Error(`signal ${signal} is unsupported on Windows; only SIGINT, SIGTERM, and SIGKILL are available`)
      }
    }
    this.inspector.signalGroup(foreground.processGroupId, signal)
    return foreground.processGroupId
  }

  terminate() {
    if (this.cleanup !== undefined) return this.cleanup
    const cleanup = this.closeOnce()
    this.cleanup = cleanup
    void cleanup.catch(() => { this.cleanup = undefined })
    return cleanup
  }

  /**
   * Force-terminate the observable session synchronously during Node's exit
   * event. This does not claim quiescence and does not replace terminate().
   */
  terminateForHostExit() {
    this.forceStopDescendants()
    this.forceStopShell()
    this.forceStopDescendants()
  }

  forceStopShell() {
    if (this.exited) return
    if (this.rootIdentity !== undefined) {
      try {
        this.inspector.signalProcess(this.rootIdentity, 'SIGKILL')
      } catch (_rootExitedDuringHostExit) {
      }
      return
    }
    try {
      this.terminal.kill('SIGKILL')
    } catch (_unidentifiedShellExitedDuringHostExit) {
    }
  }

  survivors(members) {
    return members.filter(member => this.inspector.isAlive(member))
  }

  descendants() {
    const tree = this.inspector.processTree(this.pid)
    const root = tree.find(member => member.pid === this.pid)
    const rootVerified = this.rootIdentity !== undefined
      && root !== undefined
      && root.started === this.rootIdentity.started
    this.trackedDescendants = this.survivors(this.unionMembers(
      this.trackedDescendants,
      ...rootVerified ? [tree, this.inspector.processSession(this.pid)] : [],
    ).filter(member => member.pid !== this.pid))
    return this.trackedDescendants
  }

  async waitForMembers(members) {
    const until = Date.now() + this.graceMs
    let survivors = this.survivors(members)
    while (survivors.length > 0 && Date.now() < until) {
      await delay(Math.min(25, Math.max(1, until - Date.now())))
      survivors = this.survivors(members)
    }
    return survivors
  }

  signalMembers(members, signal) {
    for (const member of members) {
      try {
        this.inspector.signalProcess(member, signal)
      } catch (_alreadyExitedDuringSignal) {
      }
    }
  }

  forceStopDescendants() {
    let members = this.trackedDescendants
    try {
      members = this.descendants()
    } catch (_processTableUnavailableDuringHostExit) {
    }
    this.signalMembers(members, 'SIGKILL')
  }

  unionMembers(...groups) {
    const members = []
    const seen = new Set()
    for (const group of groups) {
      for (const member of group) {
        const key = `${member.pid}:${member.started}`
        if (seen.has(key)) continue
        seen.add(key)
        members.push(member)
      }
    }
    return members
  }

  async stopDescendants() {
    const captured = this.descendants()
    this.signalMembers(captured, 'SIGTERM')
    const capturedSurvivors = await this.waitForMembers(captured)
    const members = this.unionMembers(capturedSurvivors, this.descendants())
    this.signalMembers(members, 'SIGKILL')
    const survivors = await this.waitForMembers(members)
    return this.survivors(this.unionMembers(survivors, this.descendants()))
  }

  async stopShell() {
    if (this.platform === 'win32') {
      await this.stopShellWindows()
      return
    }
    if (!this.exited) {
      try {
        this.terminal.kill('SIGTERM')
      } catch (_topLevelAlreadyExitedDuringTerm) {
      }
      await Promise.race([this.done.then(() => undefined), delay(this.graceMs)])
    }
    if (!this.exited) {
      try {
        this.terminal.kill('SIGKILL')
      } catch (_topLevelAlreadyExitedDuringKill) {
      }
      await Promise.race([this.done.then(() => undefined), delay(this.graceMs)])
    }
    if (!this.exited) throw new Error(`terminal cleanup failed; surviving pid: ${this.pid}`)
  }

  async stopShellWindows() {
    const shellGone = () =>
      this.exited || (this.rootIdentity !== undefined && !this.inspector.isAlive(this.rootIdentity))
    if (!shellGone() && this.rootIdentity !== undefined) {
      this.inspector.signalProcess(this.rootIdentity, 'SIGTERM')
      await this.waitForWindowsShellExit()
    }
    if (!shellGone() && this.rootIdentity === undefined) {
      try {
        this.terminal.kill()
      } catch (_topLevelAlreadyExitedDuringKill) {
      }
      await Promise.race([this.done.then(() => undefined), delay(this.graceMs)])
    }
    if (!shellGone() && this.rootIdentity !== undefined) {
      this.inspector.signalProcess(this.rootIdentity, 'SIGKILL')
      await this.waitForWindowsShellExit()
    }
    if (!shellGone()) throw new Error(`terminal cleanup failed; surviving pid: ${this.pid}`)
  }

  async waitForWindowsShellExit() {
    const until = Date.now() + this.graceMs
    while (!this.exited && Date.now() < until) {
      if (this.rootIdentity !== undefined && !this.inspector.isAlive(this.rootIdentity)) return
      await delay(Math.min(25, Math.max(1, until - Date.now())))
    }
  }

  async closeOnce() {
    let survivors = await this.stopDescendants()
    if (survivors.length > 0) {
      throw new Error(`terminal cleanup failed; surviving pids: ${survivors.map(member => member.pid).join(', ')}`)
    }
    await this.stopShell()
    survivors = await this.stopDescendants()
    if (survivors.length > 0) {
      throw new Error(`terminal cleanup failed; surviving pids: ${survivors.map(member => member.pid).join(', ')}`)
    }
    this.settleExitIfGone()
    this.dataDisposable.dispose()
    this.exitDisposable.dispose()
  }

  settleExitIfGone() {
    if (this.platform !== 'win32') return
    if (this.exited) return
    /* v8 ignore next -- stopShellWindows() verified the shell is gone or threw;
       the identity re-check is a defensive fence for a future caller. */
    if (this.rootIdentity !== undefined && this.inspector.isAlive(this.rootIdentity)) return
    this.exited = true
    this.output.end()
    this.outcome.resolve({ exitCode: null, signal: null })
  }
}
