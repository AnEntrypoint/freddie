/**
 * Projection from the shared managed-process handle to the official Claude
 * Agent SDK's custom-spawn process interface.
 */

import { EventEmitter } from 'node:events'
import { scrubbedParentEnv } from '@freddie/freddie-subprocess'

function thrown(value) {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * Encode the SDK's complete child environment as a subprocess overlay.
 * @param {Record<string, string>} env - SDK-composed child environment after its removals and replacements.
 * @returns {Record<string, string | undefined>} explicit values plus tombstones for surviving ambient names the SDK removed.
 */
export function sdkEnvironmentOverlay(env) {
  const overlay = { ...env }
  for (const name of Object.keys(scrubbedParentEnv())) {
    if (!(name in env)) overlay[name] = undefined
  }
  return overlay
}

/**
 * Translate one official SDK spawn request to the shared process owner.
 * @param {import('@anthropic-ai/claude-agent-sdk').SpawnOptions} options - command, arguments, workspace, environment, and forwarded signal from the SDK.
 * @param {number} graceMs - managed-range termination grace.
 * @returns {import('@freddie/freddie-subprocess').SubprocessSpawnSpec} the fully explicit shared subprocess request.
 */
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

/**
 * SDK-facing view of one shared managed process. Protocol transport remains
 * in the official SDK; this adapter only projects streams and exit events.
 * @implements {import('@anthropic-ai/claude-agent-sdk').SpawnedProcess}
 */
export class ManagedClaudeCodeProcess {
  /**
   * Project a managed process with piped stdin and stdout.
   * @param {import('@freddie/freddie-subprocess').SubprocessHandle} child - shared handle that remains the managed-range authority.
   */
  constructor(child) {
    this.child = child
    this.stdin = child.stdin
    this.stdout = child.stdout
    this.events = new EventEmitter()
    this.outcomeValue = undefined
    this.killRequested = false
    // EventEmitter gives `error` special throw semantics without a listener.
    // The SDK attaches its listener synchronously after custom spawn returns,
    // while this no-op also contains an already-rejected spawn handle.
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

  /** Whether the SDK has requested managed-range termination. */
  get killed() {
    return this.killRequested
  }

  /** Direct-child exit code, or null while running or after signal exit. */
  get exitCode() {
    return this.outcomeValue?.exitCode ?? null
  }

  /** Direct-child terminating signal, if any. */
  get signalCode() {
    return this.outcomeValue?.signal ?? null
  }

  /** Exact managed-process outcome after exit, or undefined while running. */
  get outcome() {
    return this.outcomeValue
  }

  /**
   * Route the SDK's termination request to the managed-range process owner.
   * @param {NodeJS.Signals} _signal - SDK-selected signal; the shared seam owns its escalation ladder.
   * @returns {boolean} false only after exit or a previous termination request.
   */
  kill(_signal) {
    if (this.killRequested || this.outcomeValue !== undefined) {
      return false
    }
    this.killRequested = true
    this.child.terminate()
    return true
  }

  /** Register a persistent process lifecycle listener. */
  on(event, listener) {
    this.events.on(event, listener)
  }

  /** Register a one-shot process lifecycle listener. */
  once(event, listener) {
    this.events.once(event, listener)
  }

  /** Remove a process lifecycle listener. */
  off(event, listener) {
    this.events.off(event, listener)
  }
}
