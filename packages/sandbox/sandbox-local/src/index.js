import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LAUNCHER_BIN,
  LAUNCHER_FAILURE_EXIT,
  launcherPath as landlockLauncherPath,
  probe as defaultProbeLandlock,
} from '@freddie/node-addon-landlock-run'
import z from '@freddie/schemastery'
import { assertNever } from '@freddie/freddie-llm'
import { SandboxProvider, SandboxUnavailableError } from '@freddie/freddie-sandbox'
import { AclWriteGrant, assertTempRootOutsideWorkspace, tempWriteSid, workspaceWriteSid } from '@freddie/freddie-sandbox-windows-acl'
import { bwrapProfileArgs, landlockProfileArgs, seatbeltProfileArgs } from './profiles.js'

function defaultProbeBwrap(timeoutMs) {
  const probe = spawnSync('bwrap', [...bwrapProfileArgs({ mode: 'read-only', workspaceRoot: '/' }), '--', 'true'], {
    timeout: timeoutMs,
    stdio: 'ignore',
  })
  return probe.status === 0
}

function defaultProbeSeatbelt(seatbeltExec, timeoutMs) {
  const probe = spawnSync(seatbeltExec, [...seatbeltProfileArgs({ mode: 'read-only', workspaceRoot: '/' }), '--', 'true'], {
    timeout: timeoutMs,
    stdio: 'ignore',
  })
  return probe.status === 0
}

function defaultProbeWindowsAcl(runnerInvocation, timeoutMs) {
  const program = runnerInvocation[0]
  if (program === undefined) return false
  const probe = spawnSync(program, [
    ...runnerInvocation.slice(1),
    '--workspace', tmpdir(), '--temp', tmpdir(), '--mode', 'read-only',
    '--', 'cmd', '/c', 'exit', '0',
  ], {
    timeout: timeoutMs,
    stdio: 'ignore',
  })
  return probe.status === 0
}

const PLATFORM_CHAINS = {
  linux: ['bwrap', 'landlock'],
  darwin: ['seatbelt'],
  win32: ['windows-acl'],
}

const STATIC_ENFORCEMENT = {
  bwrap: 'full',
  landlock: 'full',
  seatbelt: 'full',
  'windows-acl': 'partial',
}

function assertPositiveFinite(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`sandbox-local: ${name} must be a positive finite number`)
  }
}

const DENIAL_SIGNATURES = {
  bwrap: ['read-only file system'],
  landlock: ['permission denied'],
  seatbelt: ['operation not permitted'],
  'windows-acl': ['access is denied', 'access to the path', 'permission denied'],
  runnerCommand: ['read-only file system', 'permission denied'],
}

const WINDOWS_ACL_RUNNER_FAILURE_EXIT = 127

const RUNNER_FAILURE_RULES = {
  bwrap: [{ fatalSignatures: ['bwrap: '] }],
  landlock: [{
    allowedExitCodes: [LAUNCHER_FAILURE_EXIT],
    fatalSignatures: [`${LAUNCHER_BIN}: `],
    informationalLines: [`${LAUNCHER_BIN}: partial enforcement (older Landlock ABI)`],
  }],
  seatbelt: [{ fatalSignatures: ['sandbox-exec: '] }],
  'windows-acl': [{ allowedExitCodes: [WINDOWS_ACL_RUNNER_FAILURE_EXIT], fatalSignatures: ['windows-acl-run: '] }],
}

export class LocalSandboxProvider extends SandboxProvider {
  static Config = z.object({
    runnerCommand: z.array(z.string()).default([]),
    runnerFailureSignatures: z.array(z.string()).default([]),
    probeTimeoutMs: z.natural().default(5_000),
  })

  internals = {}

  runnerCommand
  configuredRunnerFailureSignatures
  probeTimeoutMs
  selectedRunner
  workspaceGrants = new Map()
  tempCapabilities = new Map()

  constructor(ctx, config) {
    super(ctx)
    const runner = config.runnerCommand
    const runnerFailureSignatures = config.runnerFailureSignatures
    if (runner.length === 0 && runnerFailureSignatures.length > 0) {
      throw new Error('sandbox-local: runnerFailureSignatures requires runnerCommand')
    }
    if (runner.length > 0 && runnerFailureSignatures.length === 0) {
      throw new Error('sandbox-local: runnerCommand requires at least one runnerFailureSignatures entry')
    }
    if (runnerFailureSignatures.some(signature => signature.trim().length === 0 || /[\r\n]/u.test(signature))) {
      throw new Error('sandbox-local: runnerFailureSignatures entries must be non-empty single-line strings')
    }
    this.runnerCommand = runner.length > 0 ? runner : undefined
    this.configuredRunnerFailureSignatures = runnerFailureSignatures
    this.probeTimeoutMs = config.probeTimeoutMs
    assertPositiveFinite('probeTimeoutMs', this.probeTimeoutMs)
    ctx.effect(() => () => {
      this.revokeAclGrants()
    })
  }

  confine(argv, policy) {
    if (this.runnerCommand !== undefined) {
      return {
        argv: [...this.runnerCommand, ...bwrapProfileArgs(policy), '--', ...argv],
        enforcement: 'full',
        denialSignatures: DENIAL_SIGNATURES.runnerCommand,
        runnerFailureRules: [{ fatalSignatures: this.configuredRunnerFailureSignatures }],
      }
    }
    const selected = this.selectRunner(policy.mode)
    const runnerArgv = this.runnerArgv(selected.runner, policy)
    return {
      argv: [...runnerArgv, '--', ...argv],
      enforcement: selected.enforcement,
      denialSignatures: DENIAL_SIGNATURES[selected.runner],
      runnerFailureRules: RUNNER_FAILURE_RULES[selected.runner],
    }
  }

  runnerArgv(runner, policy) {
    switch (runner) {
      case 'bwrap': return ['bwrap', ...bwrapProfileArgs(policy)]
      case 'landlock': return [this.landlockLauncher(), ...landlockProfileArgs(policy)]
      case 'seatbelt': return [this.seatbeltExec(), ...seatbeltProfileArgs(policy)]
      case 'windows-acl': return this.windowsAclRunnerArgv(policy)
      default: return assertNever(runner)
    }
  }

  windowsAclRunnerArgv(policy) {
    const sessionId = policy.sessionId
    if (sessionId === undefined || policy.mode === 'read-only') {
      return [
        ...this.windowsAclRunnerInvocation(),
        '--workspace', policy.workspaceRoot,
        '--temp', tmpdir(),
        '--mode', policy.mode,
      ]
    }
    const temp = this.materializeAclGrant(sessionId, policy.workspaceRoot)
    return [
      ...this.windowsAclRunnerInvocation(),
      '--workspace', policy.workspaceRoot,
      '--temp', temp.dir,
      '--mode', policy.mode,
      '--write-sid', workspaceWriteSid(policy.workspaceRoot),
      '--temp-write-sid', temp.writeSid,
    ]
  }

  materializeAclGrant(sessionId, workspaceRoot) {
    assertTempRootOutsideWorkspace(workspaceRoot, tmpdir())
    const writeSid = workspaceWriteSid(workspaceRoot)
    if (!this.workspaceGrants.has(workspaceRoot)) {
      const grant = AclWriteGrant.create(writeSid)
      try {
        grant.add(workspaceRoot, true)
      } catch (error) {
        try {
          grant.dispose()
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], 'sandbox-local windows-acl workspace grant failed and its cleanup also failed')
        }
        throw error
      }
      this.workspaceGrants.set(workspaceRoot, grant)
    }
    const key = JSON.stringify([String(sessionId), workspaceRoot])
    const existing = this.tempCapabilities.get(key)
    if (existing !== undefined) return existing
    const tempDir = mkdtempSync(join(tmpdir(), 'freddie-'))
    const tempSid = tempWriteSid(tempDir)
    let grant
    try {
      grant = AclWriteGrant.create(tempSid)
      grant.add(tempDir)
    } catch (error) {
      const cleanupFailures = []
      if (grant !== undefined) {
        try {
          grant.dispose()
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError)
        }
      }
      try {
        this.removeTempDir(tempDir)
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError)
      }
      if (cleanupFailures.length > 0) {
        throw new AggregateError([error, ...cleanupFailures], 'sandbox-local windows-acl temp grant materialization failed and its cleanup also failed')
      }
      throw error
    }
    const capability = { dir: tempDir, writeSid: tempSid, grant }
    this.tempCapabilities.set(key, capability)
    return capability
  }

  revokeAclGrants() {
    if (this.workspaceGrants.size === 0 && this.tempCapabilities.size === 0) return
    const failures = []
    for (const grant of [...this.workspaceGrants.values(), ...[...this.tempCapabilities.values()].map(capability => capability.grant)]) {
      try {
        grant.dispose()
      } catch (error) {
        failures.push(error)
      }
    }
    for (const { dir } of this.tempCapabilities.values()) {
      try {
        this.removeTempDir(dir)
      } catch (error) {
        failures.push(error)
      }
    }
    this.workspaceGrants.clear()
    this.tempCapabilities.clear()
    if (failures.length > 0) {
      this.ctx.logger.warn(`sandbox-local: windows-acl grant cleanup completed with ${failures.length} failure(s)`)
      for (const error of failures) this.ctx.logger.warn(error)
    }
  }

  removeTempDir(dir) {
    const remove = this.internals.rmTempDir ?? ((path) => { rmSync(path, { recursive: true, force: true }) })
    remove(dir)
  }

  selectRunner(mode) {
    this.selectedRunner ??= this.chainVerdict()
    if (this.selectedRunner === 'unavailable') throw new SandboxUnavailableError(mode)
    return this.selectedRunner
  }

  chainVerdict() {
    const chain = this.internals.chain ?? PLATFORM_CHAINS[this.internals.platform ?? process.platform] ?? []
    const [first, ...rest] = chain
    if (first === undefined) return 'unavailable'
    if (rest.length === 0) return { runner: first, enforcement: STATIC_ENFORCEMENT[first] }
    for (const runner of chain) {
      const enforcement = this.probeRunner(runner)
      if (enforcement !== 'unusable') return { runner, enforcement }
    }
    return 'unavailable'
  }

  probeRunner(runner) {
    switch (runner) {
      case 'bwrap': {
        const probe = this.internals.probeBwrap ?? (() => defaultProbeBwrap(this.probeTimeoutMs))
        return probe() ? 'full' : 'unusable'
      }
      case 'landlock': {
        const probe = this.internals.probeLandlock ?? (launcher => defaultProbeLandlock(launcher, { timeoutMs: this.probeTimeoutMs }))
        return probe(this.landlockLauncher())
      }
      case 'seatbelt': {
        const probe = this.internals.probeSeatbelt ?? (exec => defaultProbeSeatbelt(exec, this.probeTimeoutMs))
        return probe(this.seatbeltExec()) ? 'full' : 'unusable'
      }
      case 'windows-acl': {
        const probe = this.internals.probeWindowsAcl
          ?? (() => defaultProbeWindowsAcl(this.windowsAclRunnerInvocation(), this.probeTimeoutMs))
        return probe() ? 'partial' : 'unusable'
      }
      default: return assertNever(runner)
    }
  }

  landlockLauncher() {
    return this.internals.landlockLauncher ?? landlockLauncherPath()
  }

  seatbeltExec() {
    return this.internals.seatbeltExec ?? 'sandbox-exec'
  }

  windowsAclRunnerInvocation() {
    const override = this.internals.windowsAclRunnerArgs
    if (override !== undefined) return override
    const builtEntry = this.internals.windowsAclRunnerEntry ?? fileURLToPath(import.meta.resolve('@freddie/freddie-sandbox-windows-acl/runner'))
    if (existsSync(builtEntry)) return [process.execPath, builtEntry]
    const sourceEntry = fileURLToPath(import.meta.resolve('@freddie/freddie-sandbox-windows-acl/src/runner.js'))
    return [process.execPath, '--import', 'tsx/esm', sourceEntry]
  }
}

export default LocalSandboxProvider
