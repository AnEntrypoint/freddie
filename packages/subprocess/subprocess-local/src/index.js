import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { delimiter, extname, isAbsolute, resolve } from 'node:path'
import * as nodePty from 'node-pty'
import { SubprocessRuntime } from '@freddie/freddie-subprocess'
import { childEnv, spawnSubprocess } from './spawn.js'
import { createProcessInspector } from './process-inspector.js'
import { LocalTerminalHandle } from './terminal.js'

export class LocalSubprocessRuntime extends SubprocessRuntime {
  live = new Set()
  terminals = new Set()
  internals = {}
  terminalInspector

  constructor(ctx) {
    super(ctx)
    ctx.effect(() => {
      const onHostExit = () => { this.terminateForHostExit() }
      process.prependListener('exit', onHostExit)
      return async () => {
        try {
          await this.disposeManagedProcesses()
        } finally {
          process.off('exit', onHostExit)
        }
      }
    }, 'local subprocess teardown')
  }

  terminateForHostExit() {
    for (const handle of this.live) {
      try {
        handle.terminateForHostExit()
      } catch (_ordinaryTreeTerminationFailed) {
      }
    }
    for (const terminal of this.terminals) {
      try {
        terminal.terminateForHostExit()
      } catch (_terminalTerminationFailed) {
      }
    }
  }

  async disposeManagedProcesses() {
    const pending = []
    for (const handle of this.live) {
      handle.terminate()
      pending.push(handle.done.catch(() => {}).then(() => handle.waitForExit()))
    }
    for (const terminal of this.terminals) {
      pending.push(terminal.terminate())
    }
    const outcomes = await Promise.allSettled(pending)
    const failures = outcomes.flatMap(outcome => outcome.status === 'rejected'
      ? [outcome.reason]
      : [])
    if (failures.length > 0) this.terminateForHostExit()
    this.live.clear()
    this.terminals.clear()
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'local subprocess teardown failed')
  }

  async resolveExecutable(command, env, signal) {
    if (command.length === 0) throw new Error('subprocess-local: executable must be non-empty')
    signal?.throwIfAborted()
    const environment = childEnv(env)
    const absolute = isAbsolute(command)
    if (!absolute && (command.includes('/') || (process.platform === 'win32' && command.includes('\\')))) {
      throw new Error(
        `subprocess-local: command ${JSON.stringify(command)} is a relative path; use an absolute path or a bare PATH name`,
      )
    }
    const candidates = absolute ? [command] : this.executableCandidates(command, environment)
    for (const candidate of candidates) {
      signal?.throwIfAborted()
      try {
        const info = await stat(candidate)
        if (!info.isFile()) continue
        await access(candidate, constants.X_OK)
        signal?.throwIfAborted()
        return candidate
      } catch {
      }
    }
    signal?.throwIfAborted()
    throw new Error(absolute
      ? `subprocess-local: command ${JSON.stringify(command)} is not an executable file`
      : `subprocess-local: command ${JSON.stringify(command)} was not found on PATH`)
  }

  executableCandidates(command, env) {
    const path = environmentValue(env, 'PATH') ?? ''
    const extensions = process.platform === 'win32' && extname(command) === ''
      ? (environmentValue(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD').split(';')
      : ['']
    return path.split(delimiter).flatMap(directory =>
      extensions.map(extension => resolve(process.cwd(), directory, command + extension)))
  }

  spawn(spec) {
    const handle = spawnSubprocess(spec, this.internals)
    this.live.add(handle)
    const release = () =>
      handle.waitForExit().then(() => { this.live.delete(handle) })
    handle.done.then(release, release)
    return handle
  }

  async spawnTerminal(spec) {
    const file = spec.argv[0]
    if (file === undefined || file.length === 0) {
      throw new Error('subprocess-local: terminal argv must contain a program')
    }
    spec.signal?.throwIfAborted()
    const options = {
      name: 'dumb',
      rows: spec.rows,
      cols: spec.cols,
      cwd: spec.cwd,
      env: childEnv(spec.env),
    }
    const inspector = this.terminalInspector ?? createProcessInspector()
    const terminal = nodePty.spawn(file, [...spec.argv.slice(1)], options)
    const handle = new LocalTerminalHandle(terminal, inspector, spec.graceMs)
    this.terminals.add(handle)
    const release = async () => {
      await handle.terminate()
      this.terminals.delete(handle)
    }
    void handle.done.then(release, release).catch(() => {})
    return handle
  }
}

function environmentValue(env, name) {
  const exact = env[name]
  if (exact !== undefined || process.platform !== 'win32') return exact
  const normalized = name.toUpperCase()
  return Object.entries(env).find(([key]) => key.toUpperCase() === normalized)?.[1]
}

export default LocalSubprocessRuntime
