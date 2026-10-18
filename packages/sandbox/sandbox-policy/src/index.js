import { resolve as resolvePath } from 'node:path'
import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { canonicalPath } from '@freddie/freddie-sandbox'
import { effectiveSandboxMode } from './session-mode.js'

export { SANDBOX_MODES, effectiveSandboxMode, setSandboxMode } from './session-mode.js'

function resolveWorkspaceRoot(path) {
  return resolvePath(canonicalPath(path))
}

function renderPolicyContext(policy) {
  switch (policy.mode) {
    case 'read-only':
      return 'Current FREDDIE file policy: read-only. Any available operation enforced by the FREDDIE file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.'
    case 'workspace-write':
      return `Current FREDDIE file policy: workspace-write. Any available operation enforced by the FREDDIE file sandbox may modify files under the session workspace: ${JSON.stringify(policy.workspaceRoot)}. Some platform temporary areas may also be writable.`
    case 'danger-full-access':
      return 'Current FREDDIE file policy: danger-full-access. The FREDDIE file sandbox does not restrict file modifications by available operations. Do not set sandbox_permissions: no wider mode exists.'
    default: {
      const mode = policy.mode
      throw new Error(`unreachable sandbox mode: ${String(mode)}`)
    }
  }
}

export class SandboxPolicyService extends Service {
  static Config = z.object({
    mode: z.union(['read-only', 'workspace-write', 'danger-full-access']).default('read-only'),
    workspaceRoot: z.string(),
  })

  defaultMode
  workspaceRoot
  constructor(ctx, config) {
    super(ctx, 'sandboxPolicy')
    this.defaultMode = config.mode
    this.workspaceRoot = resolveWorkspaceRoot(config.workspaceRoot ?? process.cwd())

    ctx.inject(['systemPrompt'], (scope) => {
      scope.systemPrompt.context({
        name: 'sandbox:policy',
        order: 110,
        text: (context) => {
          const session = context.agent?.session
          return session === undefined
            ? ''
            : renderPolicyContext(this.resolve({ session }))
        },
      })
    })
  }

  resolve(request = {}) {
    const { session } = request
    return {
      mode: request.mode ?? (session === undefined ? undefined : this.overrideOf(session)) ?? this.defaultMode,
      workspaceRoot: resolveWorkspaceRoot(session?.header.cwd ?? this.workspaceRoot),
      ...session === undefined ? {} : { sessionId: session.id },
    }
  }

  overrideOf(session) {
    return effectiveSandboxMode(session.events)
  }
}

export default SandboxPolicyService
