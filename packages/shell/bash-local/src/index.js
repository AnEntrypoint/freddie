import z from '@freddie/schemastery'
import { SHELL_SETTINGS_NAMESPACE, ShellExecutor } from '@freddie/freddie-shell'
import { installSettingsSection } from '@freddie/freddie-settings'
import { clampTimeout, deadline, MAX_TIMER_DELAY_MS, timeoutOf } from '@freddie/freddie-timeout'

export const ENV_OVERRIDES = {
  NO_COLOR: '1',
  TERM: 'dumb',
  PAGER: 'cat',
  GIT_PAGER: 'cat',
}

const DEFAULT_GRACE_MS = 3_000

const DEFAULT_MAX_SPILL_BYTES = 64 * 1024 * 1024

function finalOutput(reader) {
  const read = reader.readFrom(0)
  return {
    text: read.text,
    truncated: read.lossy,
    ...read.spillPath !== undefined ? { spillPath: read.spillPath } : {},
  }
}

function assertPositiveFinite(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`bash-local: ${name} must be a positive finite number`)
  }
}

export function assertServiceableBashConfig(config) {
  const resolved = config
  assertPositiveFinite('timeoutMs', resolved.timeoutMs)
  assertPositiveFinite('maxTimeoutMs', resolved.maxTimeoutMs)
  assertPositiveFinite('maxOutputBytes', resolved.maxOutputBytes)
  assertPositiveFinite('maxSpillBytes', resolved.maxSpillBytes)
  assertPositiveFinite('graceMs', resolved.graceMs)
  if (resolved.graceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`bash-local: graceMs must be no greater than ${MAX_TIMER_DELAY_MS}`)
  }
}

export class LocalBashExecutor extends ShellExecutor {
  static inject = ['subprocess']

  static Config = z.object({
    cwd: z.string(),
    timeoutMs: z.number().default(120_000),
    maxTimeoutMs: z.number().default(600_000),
    maxOutputBytes: z.number().default(64_000),
    maxSpillBytes: z.number().default(DEFAULT_MAX_SPILL_BYTES),
    graceMs: z.number().default(DEFAULT_GRACE_MS),
  })

  source

  get config() {
    return this.source()
  }

  constructor(ctx, config) {
    super(ctx)
    const entry = config
    assertServiceableBashConfig(entry)
    this.source = () => entry
    installSettingsSection(ctx, SHELL_SETTINGS_NAMESPACE, LocalBashExecutor.Config, entry, {
      validate: assertServiceableBashConfig,
      setSource: (current) => {
        this.source = current
      },
      onChange: () => {},
    })
  }

  resolve(request) {
    const timeoutMs = clampTimeout(
      request.timeoutMs,
      this.config.timeoutMs,
      this.config.maxTimeoutMs,
      'bash-local: request.timeoutMs',
    )
    const stdoutMaxBytes = request.stdoutMaxBytes ?? this.config.maxOutputBytes
    assertPositiveFinite('request.stdoutMaxBytes', stdoutMaxBytes)
    return {
      command: request.command,
      workdir: request.workdir ?? this.config.cwd ?? process.cwd(),
      timeoutMs,
      stdoutMaxBytes,
      ...request.signal ? { signal: request.signal } : {},
      ...request.stdin !== undefined ? { stdin: request.stdin } : {},
      ...request.env !== undefined ? { env: request.env } : {},
      ...request.freddieEnv !== undefined ? { freddieEnv: request.freddieEnv } : {},
      sandboxPolicy: request.sandboxPolicy,
    }
  }

  spawnSpec(
    spec,
    argv,
    stdoutMaxBytes,
    signal,
  ) {
    const collect = (maxBytes) =>
      ({ maxBytes, spill: { maxBytes: this.config.maxSpillBytes } })
    return {
      argv,
      cwd: spec.workdir,
      stdio: {
        stdin: spec.stdin !== undefined ? { data: spec.stdin } : 'ignore',
        stdout: collect(stdoutMaxBytes),
        stderr: collect(this.config.maxOutputBytes),
      },
      graceMs: this.config.graceMs,
      signal,
      env: { ...ENV_OVERRIDES, ...spec.env, ...spec.freddieEnv },
    }
  }

  static collected(handle) {
    const { stdout, stderr } = handle.collected
    if (stdout === undefined || stderr === undefined) {
      throw new Error('bash-local: subprocess implementation dropped a requested collect stream')
    }
    return { stdout, stderr }
  }

  async run(spec) {
    return this.runArgv(spec, ['bash', '-c', spec.command])
  }

  async runArgv(spec, argv) {
    using d = deadline(spec.signal, spec.timeoutMs, 'BASH_TIMEOUT')
    const handle = this.ctx.subprocess.spawn(this.spawnSpec(spec, argv, spec.stdoutMaxBytes, d.signal))
    const outcome = await handle.done
    const collected = LocalBashExecutor.collected(handle)
    const timedOut = timeoutOf(d.signal, 'BASH_TIMEOUT') !== undefined
    const aborted = d.signal.aborted && !timedOut
    return {
      ...outcome,
      timedOut,
      aborted,
      timeoutMs: spec.timeoutMs,
      stdout: finalOutput(collected.stdout),
      stderr: finalOutput(collected.stderr),
    }
  }

  start(spec) {
    return this.startArgv(spec, ['bash', '-c', spec.command])
  }

  startArgv(spec, argv) {
    const running = this.ctx.subprocess.spawn(this.spawnSpec(spec, argv, this.config.maxOutputBytes, spec.signal))
    const collected = LocalBashExecutor.collected(running)

    let spawnFailureNote
    const consumeSpawnFailure = () => {
      const note = spawnFailureNote ?? ''
      spawnFailureNote = undefined
      return note
    }

    let stdoutOffset = 0
    let stderrOffset = 0
    const proc = {
      status: 'running',
      exitCode: null,
      signal: null,
      done: running.done.then((outcome) => {
        if (proc.status === 'running') {
          proc.status = spec.signal?.aborted === true || outcome.signal !== null ? 'killed' : 'completed'
        }
        proc.exitCode = outcome.exitCode
        proc.signal = outcome.signal
        this.onProcessDone(proc, collected.stderr.readFrom(0).text, false)
      }, (error) => {
        proc.status = 'killed'
        spawnFailureNote = `spawn failed: ${String(error)}`
        this.onProcessDone(proc, spawnFailureNote, true, error)
      }),
      readOutput: () => {
        const out = collected.stdout.readFrom(stdoutOffset)
        const err = collected.stderr.readFrom(stderrOffset)
        stdoutOffset = out.nextOffset
        stderrOffset = err.nextOffset

        const errText = err.text.length > 0 ? err.text : consumeSpawnFailure()
        const separator = out.text.length > 0 && !out.text.endsWith('\n') ? '\n' : ''
        const delta = out.text
          + (errText.length > 0 ? `${separator}[stderr]\n${errText}` : '')
        return {
          delta,
          lossy: out.lossy || err.lossy,
          ...out.spillPath !== undefined ? { stdoutSpillPath: out.spillPath } : {},
          ...err.spillPath !== undefined ? { stderrSpillPath: err.spillPath } : {},
        }
      },
      kill: () => {
        if (proc.status !== 'running') return false
        proc.status = 'killed'
        running.terminate()
        return true
      },
    }
    return proc
  }

  onProcessDone(_proc, _stderr, _spawnFailed, _spawnError) {}
}

export default LocalBashExecutor
