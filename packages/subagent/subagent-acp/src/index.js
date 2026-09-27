/**
 * Out-of-process ACP subagent backend. Each child has its own process,
 * session, model, and tools, so it shares no Cordis context and advertises no
 * parent-enforced start capabilities; the ONE thing it reads off
 * `request.parent` is the session's workspace cwd.
 */

import { accessSync, constants, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import z from '@freddie/schemastery'
import { MAX_TIMER_DELAY_MS } from '@freddie/freddie-timeout'
import { acpConfigurationFailure, DEFAULT_DISPOSE_EOF_GRACE_MS, DEFAULT_DISPOSE_GRACE_MS, startAcpRun } from './run.js'

export const name = 'subagent-acp'
export const inject = ['subagents', 'subprocess']

/**
 * @typedef {object} Config
 * @property {string} [providerName] - Provider name on `ctx.subagents` (default `acp`).
 * @property {string} command - The executable to spawn for each run (the child ACP agent).
 * @property {string[]} [args] - Arguments passed to `command`.
 * @property {string} [cwd] - Working directory override for the child process and its ACP
 *   session. Must be non-empty; a relative path resolves against the harness launch directory
 *   at load, and the result must be an existing directory. When omitted, each child inherits
 *   its delegating parent session's cwd — and starting one from a parent session that has no
 *   cwd fails.
 * @property {'allow' | 'reject'} [permission] - How to auto-answer the child's
 *   `session/request_permission` prompts: `reject` (default) or `allow` (approve via the first
 *   `allow_once`/`allow_always` option). No prompt is surfaced to a human.
 * @property {Record<string, string>} [env] - Extra environment variables for the child process,
 *   forwarded on top of a credential-scrubbed copy of the parent env.
 * @property {number} [disposeEofGraceMs] - Grace period (ms) for the child's EOF-driven quiesce
 *   on dispose. Must not exceed `MAX_TIMER_DELAY_MS`.
 * @property {number} [disposeGraceMs] - Failure-observation and termination-escalation grace
 *   (ms); must not exceed `MAX_TIMER_DELAY_MS`.
 */

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

/** A process grace must fit every Node timer that observes or terminates the child. */
function assertPositiveFinite(name, value) {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMER_DELAY_MS) {
    throw new Error(`subagent-acp: ${name} must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
}

/**
 * Whether `path` names an existing directory the harness can ENTER. The
 * search-permission probe matters: `statSync().isDirectory()` is true for a
 * mode-600 directory, but a subprocess cwd needs `X_OK` or spawn fails EACCES.
 */
function isDirectory(path) {
  try {
    if (!statSync(path).isDirectory()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    // statSync/accessSync throw only filesystem access errors here
    // (ENOENT/EACCES/ENOTDIR/…), and every one of them means the path cannot
    // serve as the child's cwd.
    return false
  }
}

/**
 * Assert `cwd` can actually host the child: absolute (it doubles as the ACP
 * session workspace, and a relative path would be re-anchored to the server
 * process's launch directory) and an existing directory (fail here, before
 * the process boundary, instead of as an ambiguous spawn ENOENT).
 * @param label - which source supplied the value, for the diagnostic.
 * @param cwd - the candidate working directory.
 * @returns `cwd`, validated.
 */
function assertUsableCwd(label, cwd) {
  if (!isAbsolute(cwd)) {
    throw new Error(`subagent-acp: ${label} must be an absolute path: ${cwd}`)
  }
  if (!isDirectory(cwd)) {
    throw new Error(`subagent-acp: ${label} is not an accessible directory: ${cwd}`)
  }
  return cwd
}

/**
 * Resolve the child's working directory: the deployment `cwd` override when
 * configured (already validated at load), else the parent session's
 * workspace cwd (validated here, its earliest resolvable point). Fails loud
 * when neither exists — falling back to the harness process cwd would
 * silently bind the child to the server's launch directory instead of the
 * delegating session's workspace (one server process serves many sessions,
 * each with its own cwd).
 */
function resolveCwd(configured, request) {
  if (configured !== undefined) return configured
  const parentCwd = request.parent.session.header.cwd
  if (parentCwd === undefined) {
    throw new Error('subagent-acp: no working directory for the child — configure `cwd` or delegate from a parent session that has one')
  }
  return assertUsableCwd('parent session cwd', parentCwd)
}

/**
 * The ACP provider. Advertises NO start-time capabilities: an out-of-process
 * child cannot honor `agentOptions`/`outputSchema`/`maxDepth`/`toolFilter`/
 * `persona` (the service rejects a request needing any before `start` runs).
 */
class AcpProvider {
  capabilities = {
    agentOptions: false,
    outputSchema: false,
    depthLimit: false,
    toolFilter: false,
    persona: false,
  }

  // Context contract: an out-of-process ACP child starts fresh — no parent conversation crosses the process boundary.
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
        // The seam forbids `result` rejecting, so a child-level failure is
        // flattened to a stop reason — preserve it here rather than losing it.
        this.ctx.logger.warn(`subagent-acp "${this.name}": child run failed (${stopReason}): ${error.message}`)
      },
    }
    return startAcpRun(request, spec)
  }
}

/**
 * Register one Profile-named ACP provider.
 * @param {import('@freddie/cordis').Context} ctx - context carrying shared subagent and subprocess services.
 * @param {Config} config - executable/args, workspace override, permission policy, child environment, and disposal grace.
 */
export function apply(ctx, config) {
  assertPositiveFinite('disposeEofGraceMs', config.disposeEofGraceMs)
  assertPositiveFinite('disposeGraceMs', config.disposeGraceMs)
  // `path.resolve('')` is the process cwd — an empty string would silently
  // reintroduce the launch-directory fallback this resolution removes.
  if (config.cwd === '') {
    throw new Error('subagent-acp: config cwd must not be empty — omit the key to inherit the parent session cwd')
  }
  // Interpret a relative configured cwd against the harness launch directory
  // ONCE, at load, and fail a misconfigured directory here — not per start.
  const validated = config.cwd === undefined
    ? config
    : { ...config, cwd: assertUsableCwd('config cwd', resolve(config.cwd)) }
  ctx.subagents.registerProvider(new AcpProvider(validated.providerName, ctx, validated))
}
