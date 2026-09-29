import { randomUUID } from 'node:crypto'
import { Context, Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { createUserMessage } from '@freddie/freddie-llm'
import { scopeTarget } from '@freddie/freddie-scope'

import { ApprovalRequestId } from './types.js'

export { ApprovalRequestId } from './types.js'

const OUTCOMES = ['allowed-once', 'rejected', 'cancelled', 'unavailable']

export const APPROVAL_POLICIES = ['ask', 'never']

const NEVER_SENTENCE = 'Approval prompts are disabled in this session: actions that require approval are rejected automatically — do not request sandbox escalation (do not set `sandbox_permissions`).'
const ASK_SENTENCE = 'Approval policy: ask. Operations that require approval may ask through the configured answerers; without an available answerer, the request fails closed.'

export function effectiveApprovalPolicy(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.type === 'approval/policy') return event.data.policy
  }
  return undefined
}

function hasOpenTurn(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const type = events[index].type
    if (type === 'turn/start') return true
    if (type === 'turn/end') return false
  }
  return false
}

export function setApprovalPolicy(session, policy) {
  if (!APPROVAL_POLICIES.includes(policy)) {
    throw new TypeError('approval policy must be one of "ask" or "never"')
  }
  session.append('approval/policy', { policy })
}

export class ApprovalService extends Service {
  static Config = z.object({
    policy: z.union(['ask', 'never']).default('ask'),
  })

  constructor(ctx, config) {
    super(ctx, 'approval')
    this.config = config

    const effective = (agent) => this.effectivePolicy(agent.session)

    ctx.inject(['systemPrompt'], (scope) => {
      scope.systemPrompt.context({
        name: 'approval:policy',
        order: 115,
        text: (context) => {
          const agent = context.agent
          if (agent === undefined) return ''
          const policy = effective(agent)
          return policy === 'never' ? NEVER_SENTENCE : ASK_SENTENCE
        },
      })
    })
  }

  setPolicy(agent, policy) {
    const previous = this.effectivePolicy(agent.session)
    if (previous === policy) return
    setApprovalPolicy(agent.session, policy)
    agent.inject(createUserMessage({
      content: [{
        type: 'text',
        text: `The approval policy changed from "${previous}" to "${policy}" (changed by the user).`,
      }],
      source: { kind: 'plugin', plugin: 'user-approval' },
    }))
  }

  async request(req) {
    const session = req.agent.session
    if (!hasOpenTurn(session.events)) {
      throw new Error(
        'approval.request() outside an open turn: the approval/asked + approval/decided audit pair '
        + 'must be turn-enclosed (a bare event between turns is crash-tail garbage on reload). '
        + 'Ask from inside the turn that needs the decision.',
      )
    }
    const id = ApprovalRequestId(randomUUID())
    session.append('approval/asked', {
      id,
      toolName: req.toolName,
      ...req.callId !== undefined ? { callId: req.callId } : {},
      ...req.reason !== undefined ? { reason: req.reason } : {},
    })
    const outcome = await this.decide(req, session)
    session.append('approval/decided', { id, outcome })
    return outcome
  }

  effectivePolicy(session) {
    return this.overrideOf(session) ?? this.config.policy ?? 'ask'
  }

  overrideOf(session) {
    return effectiveApprovalPolicy(session.events)
  }

  async decide(req, session) {
    const signal = req.signal
    if (signal?.aborted) return 'cancelled'
    if (this.effectivePolicy(session) === 'never') return 'rejected'
    const answer = Promise.resolve().then(
      () => this.ctx.waterfall(
        scopeTarget(this, req.agent), 'approval/request', req,
        () => Promise.resolve('unavailable'),
      ),
    ).then(
      outcome => OUTCOMES.includes(outcome) ? outcome : 'unavailable',
      () => 'unavailable',
    )
    if (signal === undefined) return answer
    return await new Promise((resolve) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort)
        resolve('cancelled')
      }
      signal.addEventListener('abort', onAbort, { once: true })
      void answer.then((outcome) => {
        signal.removeEventListener('abort', onAbort)
        resolve(outcome)
      })
    })
  }
}

export default ApprovalService
