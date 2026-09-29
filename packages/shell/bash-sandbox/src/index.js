import { SandboxUnavailableError } from '@freddie/freddie-sandbox'
import { LocalBashExecutor } from '@freddie/freddie-bash-local'
import { classifyDenial, classifyRunnerFailure, isRunnerSpawnFailure, matchesSignature } from './helpers.js'

export class SandboxBashExecutor extends LocalBashExecutor {
  static inject = ['subprocess', 'sandbox', 'sandboxPolicy']

  processFacts = new Map()

  constructor(ctx, config) {
    super(ctx, config)
    this.mode = ctx.sandboxPolicy.defaultMode
  }

  get sandboxMode() {
    return this.mode
  }

  resolve(request) {
    return { ...super.resolve(request), sandboxPolicy: request.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve() }
  }

  async run(spec) {
    const policy = spec.sandboxPolicy
    const { mode } = policy
    if (mode === 'danger-full-access') {
      const result = await super.run(spec)
      return { ...result, sandbox: { mode, denied: false } }
    }
    const confined = this.confine(spec.command, { ...policy, mode })
    let result
    try {
      result = await this.runArgv(spec, confined.argv)
    } catch (error) {
      if (spec.signal?.aborted === true) spec.signal.throwIfAborted()
      if (isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
        throw new SandboxUnavailableError(mode, String(error))
      }
      throw error
    }
    const runnerFailure = classifyRunnerFailure(result.exitCode, result.stderr.text, confined.runnerFailureRules)
    if (runnerFailure !== undefined) {
      throw new SandboxUnavailableError(mode, runnerFailure.detail)
    }
    return { ...result, sandbox: { mode, denied: classifyDenial(result, confined.denialSignatures), enforcement: confined.enforcement } }
  }

  start(spec) {
    const policy = spec.sandboxPolicy
    const { mode } = policy
    if (mode === 'danger-full-access') return super.start(spec)
    const confined = this.confine(spec.command, { ...policy, mode })
    let proc
    try {
      proc = this.startArgv(spec, confined.argv)
    } catch (error) {
      if (isRunnerSpawnFailure(error, confined.argv[0], spec.workdir)) {
        throw new SandboxUnavailableError(mode, String(error))
      }
      throw error
    }
    const { enforcement, denialSignatures, runnerFailureRules } = confined
    this.processFacts.set(proc, {
      mode,
      enforcement,
      denialSignatures,
      runnerFailureRules,
      runnerProgram: confined.argv[0],
      workdir: spec.workdir,
    })
    return proc
  }

  onProcessDone(proc, stderr, spawnFailed, spawnError) {
    const facts = this.processFacts.get(proc)
    if (facts !== undefined) {
      this.processFacts.delete(proc)
      const runnerFailed = spawnFailed
        ? isRunnerSpawnFailure(spawnError, facts.runnerProgram, facts.workdir)
        : classifyRunnerFailure(proc.exitCode, stderr, facts.runnerFailureRules) !== undefined
      proc.sandbox = {
        mode: facts.mode,
        denied: !runnerFailed && matchesSignature(proc.exitCode, stderr, facts.denialSignatures),
        enforcement: facts.enforcement,
        ...(runnerFailed ? { runnerFailed } : {}),
      }
    }
    super.onProcessDone(proc, stderr, spawnFailed, spawnError)
  }

  confine(command, policy) {
    return this.ctx.sandbox.confine(['bash', '-c', command], policy)
  }
}

export default SandboxBashExecutor
