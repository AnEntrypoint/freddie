/**
 * The escalation vocabulary and choreography shared by every sandbox-enforcing
 * tool family (`@freddie/freddie-tool-bash`, `@freddie/freddie-tool-fs`): the
 * strictly-wider ladder, the argument-pairing validation, the model-facing
 * denial/hint markers, and {@link approveEscalation} — the ordered fail-closed
 * sequence that resolves a `sandbox_permissions` request through a
 * user-approval channel BEFORE anything executes. A request at or below the
 * call's standing mode is a no-op, because execution already has that access.
 * One home keeps the two
 * families' approval ordering and verbatim error texts from drifting apart.
 *
 * The channel is a minimal STRUCTURAL function shape ({@link EscalationAsk}),
 * not the approval service type: the tool layer — which owns the agent, the
 * call id, and the tool name — closes over `ctx.approval.request(...)` and
 * hands the closure down, so this package never depends on the approval or
 * agent packages.
 *
 * @module freddie-sandbox/escalation
 */

import { assertNever } from '@freddie/freddie-llm'

/**
 * The minimal structural shape this package needs from an approval service —
 * just the one method {@link approveEscalation} calls — declared here rather
 * than imported so this package never depends on `@freddie/freddie-user-approval`.
 * @typedef {object} EscalationAsk
 * @property {(req: {agent: unknown, toolName: string, callId?: string, reason?: string, signal?: AbortSignal}) => Promise<'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'>} request
 */

/**
 * The strictly-wider table: what a call whose effective mode is the key may
 * escalate TO. Checked at EXECUTION, never baked into a tool schema — the
 * schema's enum is {@link ESCALATION_TARGETS}, because schemas are
 * registry-global while the effective mode is per-call truth.
 */
export const WIDER_MODES = {
  'read-only': ['workspace-write', 'danger-full-access'],
  'workspace-write': ['danger-full-access'],
}

/**
 * The closed escalation-target vocabulary — every mode a call could ever
 * escalate TO (`read-only` is the floor; nothing escalates to it). Advertised
 * whenever the mounted capability confines: cutting the enum down to the modes
 * wider than the composition's DEFAULT would strand a session whose effective
 * mode sits below it (a `danger-full-access` default would advertise nothing
 * while a narrower-switched session stays confined with no lever).
 */
export const ESCALATION_TARGETS = ['workspace-write', 'danger-full-access']

/**
 * Validate the escalation argument pairing a tool schema cannot express:
 * `sandbox_permissions` and `justification` travel together — an approval
 * prompt without a reason, or a reason driving nothing, is a malformed ask —
 * and the justification must be a non-empty sentence.
 * @param sandboxPermissions - the raw `sandbox_permissions` argument, if given.
 * @param justification - the raw `justification` argument, if given.
 */
export function validateEscalationArgs(sandboxPermissions, justification) {
  if (sandboxPermissions !== undefined && justification === undefined) {
    throw new Error('invalid escalation: sandbox_permissions requires a justification')
  }
  if (justification !== undefined && sandboxPermissions === undefined) {
    throw new Error('invalid escalation: justification is only valid together with sandbox_permissions')
  }
  if (justification !== undefined && justification.trim().length === 0) {
    throw new Error('invalid justification: expected a non-empty sentence')
  }
}

/**
 * The model-facing denial marker — the one vocabulary both enforcing families
 * teach and report, so the model recognizes a policy denial identically
 * whether the kernel refused a bash file effect or the filesystem provider's
 * fence refused a mutation.
 * @param mode - the mode the denied call ran under.
 * @returns the marker line, exactly as the model sees it.
 */
export function sandboxDenialMarker(mode) {
  return `[sandbox: file access denied under ${mode} mode]`
}

/**
 * The same-turn escalation hint that rides a denial when the composition
 * advertises the escalation fields — the nudge lives at the decision point so
 * the sanctioned retry does not depend on the model recalling the tool
 * description.
 * @param subject - the family's noun for the denied action (`command` for
 *   bash, `operation` for a filesystem mutation).
 * @returns the hint line, exactly as the model sees it.
 */
export function escalationHintMarker(subject) {
  return `[sandbox: escalation available — retry this exact ${subject} once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`
}

/**
 * The escalation to judge, destructured by {@link approveEscalation}.
 * @typedef {object} EscalationRequest
 * @property {string} requestedMode - the `sandbox_permissions` argument the model sent.
 * @property {string} effectiveMode - the call's standing mode before escalation.
 * @property {string} justification - the model-supplied reason, paired with `requestedMode`.
 * @property {string} subject - the family's noun for the denied action (see {@link escalationHintMarker}).
 */

/**
 * The approval ingredients the calling tool holds, passed to {@link approveEscalation}.
 * @typedef {object} EscalationApproval
 * @property {EscalationAsk} [approver] - the composed approval service, when one is mounted.
 * @property {unknown} [agent] - the requesting agent that owns and routes the ask.
 * @property {string} toolName - resolved tool name behind the ask.
 * @property {string} [callId] - the already-presented tool call this question answers.
 * @property {AbortSignal} [signal] - live cancellation for the ask.
 */

/**
 * Resolve a sandbox-escalation request BEFORE anything executes: check strict
 * widening against the call's effective mode, then resolve the approval
 * channel, then map every outcome — the ordered fail-closed sequence both
 * enforcing families share. Returns the granted mode to stamp onto exactly
 * this call; throws the distinct verbatim text for every other path (a
 * missing approval service, an agent-less execution, a rejection, a
 * cancellation, an unanswerable ask) — the tool registry turns the throw into
 * the call's isError result, and nothing has run. A non-widening request
 * retains the effective mode and never prompts a human.
 * @param request - the escalation to judge (see {@link EscalationRequest}).
 * @param approval - the approval ingredients the tool holds (see {@link EscalationApproval}).
 * @returns the granted mode, consumed by the one call that asked.
 */
export async function approveEscalation(request, approval) {
  const { requestedMode: mode, effectiveMode, justification, subject } = request
  if (!(WIDER_MODES[effectiveMode] ?? []).includes(mode)) {
    return effectiveMode
  }
  if (approval.approver === undefined) {
    throw new Error(`sandbox escalation to "${mode}" requires approval, but no approval service is composed`)
  }
  if (approval.agent === undefined) {
    throw new Error(`sandbox escalation to "${mode}" requires approval, but the call has no agent to route it through`)
  }
  const outcome = await approval.approver.request({
    agent: approval.agent,
    toolName: approval.toolName,
    callId: approval.callId,
    reason: `escalate sandbox to ${mode}: ${justification}`,
    ...approval.signal ? { signal: approval.signal } : {},
  })
  switch (outcome) {
    case 'allowed-once': return mode
    case 'rejected': throw new Error(`the user rejected escalating this ${subject} to "${mode}"`)
    case 'cancelled': throw new Error(`approval for escalating to "${mode}" was cancelled`)
    case 'unavailable': throw new Error(`sandbox escalation to "${mode}" requires approval, but no approval channel is available`)
    default: return assertNever(outcome, 'EscalationOutcome')
  }
}
