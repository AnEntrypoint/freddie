import { EventEmitter } from 'node:events'
import { scrubbedParentEnv } from '@freddie/freddie-subprocess'

function thrown(value) {
  return value instanceof Error ? value : new Error(String(value))
}

export function sdkEnvironmentOverlay(env) {
  const overlay = { ...env }
  for (const name of Object.keys(scrubbedParentEnv())) {
    if (!(name in env)) overlay[name] = undefined
  }
  return overlay
}

export function claudeSpawnSpec(options, graceMs) {
  if (options.cwd === undefined || options.cwd.length === 0) {
    throw new Error('subagent-claude-code: SDK spawn request omitted its workspace')
  }
  return {
    argv: [options.command, ...options.args],
    cwd: options.cwd,
    stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' },
    graceMs,
    signal: options.signal,
    env: sdkEnvironmentOverlay(options.env),
  }
}

export class ManagedClaudeCodeProcess {
  constructor(child) {
    this.child = child
    this.stdin = child.stdin
    this.stdout = child.stdout
    this.events = new EventEmitter()
    this.outcomeValue = undefined
    this.killRequested = false
    this.events.on('error', () => {})
    void child.done.then(
      (outcome) => {
        this.outcomeValue = outcome
        this.events.emit('exit', outcome.exitCode, outcome.signal)
      },
      (error) => {
        this.events.emit('error', thrown(error))
      },
    )
  }

  get killed() {
    return this.killRequested
  }

  get exitCode() {
    return this.outcomeValue?.exitCode ?? null
  }

  get signalCode() {
    return this.outcomeValue?.signal ?? null
  }

  get outcome() {
    return this.outcomeValue
  }

  kill(_signal) {
    if (this.killRequested || this.outcomeValue !== undefined) {
      return false
    }
    this.killRequested = true
    this.child.terminate()
    return true
  }

  on(event, listener) {
    this.events.on(event, listener)
  }

  once(event, listener) {
    this.events.once(event, listener)
  }

  off(event, listener) {
    this.events.off(event, listener)
  }
}
