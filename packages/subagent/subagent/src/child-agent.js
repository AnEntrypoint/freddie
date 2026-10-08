import { delegationDepthOf } from './depth.js'

export class SubagentDepthError extends Error {
  constructor(attemptedDepth, maxDepth) {
    super(`subagent depth ${attemptedDepth} exceeds maxDepth ${maxDepth}`)
    this.attemptedDepth = attemptedDepth
    this.maxDepth = maxDepth
    this.name = 'SubagentDepthError'
  }
}

export function resolveChildDepth(parent, maxDepth) {
  const childDepth = delegationDepthOf(parent) + 1
  if (!Number.isSafeInteger(childDepth)) {
    throw new RangeError('subagent child depth exceeds the safe-integer range')
  }
  if (maxDepth !== undefined && childDepth > maxDepth) {
    throw new SubagentDepthError(childDepth, maxDepth)
  }
  return childDepth
}

export function resolveChildAgentOptions(parent, requested, childDepth) {
  const parentProvider = parent.options.provider
  const parentModel = parent.options.model
  const parentMaxTokens = parent.options.maxTokens
  return {
    ...parentProvider !== undefined ? { provider: parentProvider } : {},
    ...parentModel !== undefined ? { model: parentModel } : {},
    ...parentMaxTokens !== undefined ? { maxTokens: parentMaxTokens } : {},
    ...requested,
    subagentDepth: childDepth,
  }
}

export function childSessionMeta(parent, childDepth, lineageSeedLength) {
  const parentHeader = parent.session.header
  const agentPreset = parent.ctx.get('agentPresets')?.composedPreset(parent.ctx)
  return {
    ...parentHeader.cwd !== undefined ? { cwd: parentHeader.cwd } : {},
    ...agentPreset === undefined ? {} : { agentPreset },
    parentSession: parentHeader.id,
    origin: 'subagent',
    delegationDepth: childDepth,
    ...lineageSeedLength > 0 ? { seedLength: lineageSeedLength } : {},
  }
}


export const SUBAGENT_DELEGATION_CONTEXT
  = 'You are a delegated subagent: your permission scope was fixed when you were started and cannot be '
    + 'widened from inside this session — operations that require approval are rejected automatically. '
    + 'When the task needs access beyond that scope, do not retry the denied operation; state the '
    + 'limitation in your reply so the delegating agent can handle it.'

export function applyChildComposition(childCtx, parent, composition) {
  childCtx.get('agentPresets')?.composeFrom(childCtx, parent.ctx)
  childCtx.systemPrompt.context({ name: 'subagent:delegation', order: 120, text: SUBAGENT_DELEGATION_CONTEXT })
  if (composition.persona !== undefined) {
    childCtx.systemPrompt.section({ name: 'deployment:persona', order: 0, text: composition.persona })
  }
  if (composition.toolFilter !== undefined) childCtx.tools.restrict(composition.toolFilter)
}


export function captureDelegatedPolicyOverrides(parent) {
  return {
    sandboxMode: parent.ctx.get('sandboxPolicy')?.overrideOf(parent.session),
    approvalPolicy: parent.ctx.get('approval') === undefined ? undefined : 'never',
  }
}

export function appendDelegatedPolicyOverrides(childSession, overrides) {
  if (overrides.sandboxMode !== undefined) {
    childSession.append('sandbox/mode', { mode: overrides.sandboxMode, source: 'delegation' })
  }
  if (overrides.approvalPolicy !== undefined) {
    childSession.append('approval/policy', { policy: overrides.approvalPolicy, source: 'delegation' })
  }
}
