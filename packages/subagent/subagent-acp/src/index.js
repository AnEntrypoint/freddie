import { accessSync, constants, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import z from '@freddie/schemastery'
import { MAX_TIMER_DELAY_MS } from '@freddie/freddie-timeout'
import { acpConfigurationFailure, DEFAULT_DISPOSE_EOF_GRACE_MS, DEFAULT_DISPOSE_GRACE_MS, startAcpRun } from './run.js'

export const name = 'subagent-acp'
export const inject = ['subagents', 'subprocess']


export const Config = z.object({
  providerName: z.string().default('acp'),
  command: z.string().required(),
  args: z.array(z.string()).default([]),
  cwd: z.string(),
  permission: z.union(['allow', 'reject']).default('reject'),
  env: z.dict(z.string()).default({}),
  disposeEofGraceMs: z.number().default(DEFAULT_DISPOSE_EOF_GRACE_MS),
  disposeGraceMs: z.number().default(DEFAULT_DISPOSE_GRACE_MS),
})

function assertPositiveFinite(name, value) {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMER_DELAY_MS) {
    throw new Error(`subagent-acp: ${name} must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
}

function isDirectory(path) {
  try {
    if (!statSync(path).isDirectory()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function assertUsableCwd(label, cwd) {
  if (!isAbsolute(cwd)) {
    throw new Error(`subagent-acp: ${label} must be an absolute path: ${cwd}`)
  }
  if (!isDirectory(cwd)) {
    throw new Error(`subagent-acp: ${label} is not an accessible directory: ${cwd}`)
  }
  return cwd
}

function resolveCwd(configured, request) {
  if (configured !== undefined) return configured
  const parentCwd = request.parent.session.header.cwd
  if (parentCwd === undefined) {
    throw new Error('subagent-acp: no working directory for the child — configure `cwd` or delegate from a parent session that has one')
  }
  return assertUsableCwd('parent session cwd', parentCwd)
}

class AcpProvider {
  capabilities = {
    agentOptions: false,
    outputSchema: false,
    depthLimit: false,
    toolFilter: false,
    persona: false,
  }

  inheritsParentContext = false

  constructor(name, ctx, config) {
    this.name = name
    this.ctx = ctx
    this.config = config
  }

  start(request) {
    if (request.signal.aborted) {
      throw new Error('subagent request was aborted before the ACP child started')
    }
    let cwd
    try {
      cwd = resolveCwd(this.config.cwd, request)
    } catch (error) {
      const failure = acpConfigurationFailure(error)
      this.ctx.logger.warn(`subagent-acp "${this.name}": child start failed: %o`, error)
      throw failure
    }
    const spec = {
      command: this.config.command,
      args: this.config.args,
      cwd,
      permission: this.config.permission,
      env: this.config.env,
      disposeEofGraceMs: this.config.disposeEofGraceMs,
      disposeGraceMs: this.config.disposeGraceMs,
      spawn: spawnSpec => this.ctx.subprocess.spawn(spawnSpec),
      onError: (error, stopReason) => {
        this.ctx.logger.warn(`subagent-acp "${this.name}": child run failed (${stopReason}): ${error.message}`)
      },
    }
    return startAcpRun(request, spec)
  }
}

export function apply(ctx, config) {
  assertPositiveFinite('disposeEofGraceMs', config.disposeEofGraceMs)
  assertPositiveFinite('disposeGraceMs', config.disposeGraceMs)
  if (config.cwd === '') {
    throw new Error('subagent-acp: config cwd must not be empty — omit the key to inherit the parent session cwd')
  }
  const validated = config.cwd === undefined
    ? config
    : { ...config, cwd: assertUsableCwd('config cwd', resolve(config.cwd)) }
  ctx.subagents.registerProvider(new AcpProvider(validated.providerName, ctx, validated))
}
