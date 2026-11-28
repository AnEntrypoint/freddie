import z from '@freddie/schemastery'
import { LocalSandboxProvider } from './provider.js'
import { SandboxPolicyService } from './policy.js'

export {
  ESCALATION_TARGETS,
  WIDER_MODES,
  approveEscalation,
  escalationHintMarker,
  sandboxDenialMarker,
  validateEscalationArgs,
} from './escalation.js'
export { canonicalPath, writableRoots } from './roots.js'
export { SandboxUnavailableError } from './error.js'
export { SANDBOX_MODES, effectiveSandboxMode, setSandboxMode } from './session-mode.js'
export { classifyDenial, classifyRunnerFailure, isRunnerSpawnFailure, matchesSignature } from './runner-failure.js'

export const name = 'sandbox'

export const Config = z.object({
  mode: z.union(['read-only', 'workspace-write', 'danger-full-access']).default('read-only'),
  workspaceRoot: z.string(),
  runnerCommand: z.array(z.string()).default([]),
  runnerFailureSignatures: z.array(z.string()).default([]),
  probeTimeoutMs: z.natural().default(5_000),
})

export function apply(ctx, config) {
  new LocalSandboxProvider(ctx, config)
  new SandboxPolicyService(ctx, config)
}
