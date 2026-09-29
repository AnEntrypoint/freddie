import { randomUUID } from 'node:crypto'
import { posix } from 'node:path'
import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { FileType, Sandbox, SandboxNotFoundError } from 'e2b'

export {
  CommandExitError,
  FileNotFoundError,
  FileType,
  Sandbox,
  SandboxNotFoundError,
} from 'e2b'

export function quoteE2BShellArg(value) {
  return `'${value.replaceAll('\'', "'\"'\"'")}'`
}

export function e2bControlEnvs(overrides = {}) {
  return { ...overrides, HOME: `/.freddie-e2b-control-${randomUUID()}` }
}

export class E2BRuntime extends Service {
  static Config = z.object({
    apiKey: z.string(),
    cwd: z.string().default('/home/user/workspace'),
    timeoutMs: z.number().default(300_000),
  })

  cwd

  runtimeRoot

  config
  ready
  disposed = false

  constructor(ctx, config) {
    super(ctx, 'e2b')
    const resolved = config
    const apiKey = config.apiKey ?? process.env.E2B_API_KEY
    this.config = {
      apiKey: apiKey ?? '',
      cwd: resolved.cwd,
      timeoutMs: resolved.timeoutMs,
    }
    this.validate()
    this.cwd = this.config.cwd
    this.runtimeRoot = posix.join(this.cwd, '.freddie-e2b')
    this.ready = this.open()
    void this.ready.catch(() => {})

    ctx.effect(() => async () => {
      this.disposed = true
      let sandbox
      try {
        sandbox = await this.ready
      } catch (_sandboxSetupFailure) {
        return
      }
      try {
        await sandbox.kill()
      } catch (error) {
        if (!(error instanceof SandboxNotFoundError)) throw error
      }
    }, 'e2b sandbox teardown')
  }

  async getSandbox() {
    if (this.disposed) throw new Error('E2B sandbox service is disposing')
    const sandbox = await this.ready
    if (this.disposed) throw new Error('E2B sandbox service is disposing')
    return sandbox
  }

  validate() {
    if (this.config.apiKey.length === 0) {
      throw new Error('freddie-e2b: configure apiKey or set E2B_API_KEY')
    }
    if (!posix.isAbsolute(this.config.cwd)) {
      throw new Error(`freddie-e2b: cwd must be an absolute Linux path: ${this.config.cwd}`)
    }
    if (!Number.isFinite(this.config.timeoutMs) || this.config.timeoutMs <= 0) {
      throw new Error('freddie-e2b: timeoutMs must be a positive finite number')
    }
  }

  async open() {
    const sandbox = await Sandbox.create({
      apiKey: this.config.apiKey,
      timeoutMs: this.config.timeoutMs,
      secure: true,
      lifecycle: { onTimeout: 'kill' },
    })
    try {
      await sandbox.files.makeDir(this.cwd)
      await sandbox.files.makeDir(this.runtimeRoot)
      const runtimeRoot = await sandbox.files.getInfo(this.runtimeRoot)
      if (runtimeRoot.type !== FileType.DIR || runtimeRoot.symlinkTarget !== undefined) {
        throw new Error(`freddie-e2b: runtime root must be a real directory: ${this.runtimeRoot}`)
      }
      await sandbox.commands.run(
        `chmod 700 -- ${quoteE2BShellArg(this.runtimeRoot)}`,
        { envs: e2bControlEnvs() },
      )
      return sandbox
    } catch (error) {
      try {
        await sandbox.kill()
      } catch (_sandboxSetupRollbackFailure) {
      }
      throw error
    }
  }
}

export default E2BRuntime
