import { ESCALATION_TARGETS, approveEscalation, escalationHintMarker, sandboxDenialMarker, validateEscalationArgs } from '@freddie/freddie-sandbox'
import { FsError } from '@freddie/freddie-fs'

export class FsSandboxController {
  constructor(ctx) {
    this.ctx = ctx
    const defaultMode = ctx.fs.sandboxMode
    this.escalationModes = defaultMode === undefined ? [] : ESCALATION_TARGETS
    this.policy = defaultMode === undefined ? undefined : ctx.get('sandboxPolicy')
    if (defaultMode !== undefined && this.policy === undefined) {
      throw new Error('tool-fs: the mounted filesystem confines but ctx.sandboxPolicy is missing')
    }
  }

  schemaFields() {
    return {
      sandbox_permissions: {
        type: 'string',
        enum: [...this.escalationModes],
        description: 'The wider sandbox mode this file operation needs. Only valid as a one-shot retry '
          + 'of an operation the sandbox just denied; requires justification and user approval.',
      },
      justification: {
        type: 'string',
        description: 'Required with sandbox_permissions: one sentence for the user explaining '
          + 'why this exact file operation needs the wider access.',
      },
    }
  }

  async resolvePolicy(toolName, args, exec) {
    validateEscalationArgs(args.sandbox_permissions, args.justification)
    const standingPolicy = this.policy?.resolve({ ...exec.agent ? { session: exec.agent.session } : {} })
    if (args.sandbox_permissions === undefined || args.justification === undefined) {
      return standingPolicy
    }
    if (this.escalationModes.length === 0) {
      throw new Error('sandbox_permissions is not available in this composition (no sandboxing filesystem to escalate)')
    }
    const policy = standingPolicy
    const approvedMode = await approveEscalation(
      { requestedMode: args.sandbox_permissions, justification: args.justification, effectiveMode: policy.mode, subject: 'operation' },
      {
        approver: this.ctx.get('approval'),
        agent: exec.agent,
        callId: exec.callId,
        toolName,
        signal: exec.signal,
      },
    )
    return { ...policy, mode: approvedMode }
  }

  mapError(error, policy) {
    if (!(error instanceof FsError) || error.code !== 'FS_SANDBOX_DENIED') return error
    const mode = policy.mode
    return new FsError(`${sandboxDenialMarker(mode)}\n${escalationHintMarker('operation')}`, 'FS_SANDBOX_DENIED', { cause: error })
  }
}
