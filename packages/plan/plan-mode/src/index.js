import { Service } from '@freddie/cordis'
import { createUserMessage } from '@freddie/freddie-llm'
import { defineTool } from '@freddie/freddie-tools'
import { UserQuestionError } from '@freddie/freddie-user-questions'

export const EXIT_PLAN_MODE = 'exit_plan_mode'

const REVIEW_ID = 'plan-review'

const APPROVE_LABEL = 'Approve'

const KEEP_PLANNING_LABEL = 'Keep planning'

const EXIT_DESCRIPTION
  = 'Use only in plan mode. Present your plan for the user\'s review and, on approval, leave plan mode. '
  + 'Send the COMPLETE plan as markdown, starting with a # heading that names it. '
  + 'The user may approve (carry out the plan from your next step) or keep '
  + 'planning — their feedback comes back in the tool result; revise and present again.'

function firstHeading(plan) {
  for (const line of plan.split('\n')) {
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    if (match) return match[1]
  }
  return undefined
}

export function resolveConfig(config) {
  const section = config.section
  if (typeof section !== 'string') {
    throw new Error('PlanModeConfig needs a string `section`')
  }
  if (section.trim() === '') {
    throw new Error('PlanModeConfig needs a non-empty `section`')
  }
  const unknown = Object.keys(config).filter(key => key !== 'section')
  if (unknown.length > 0) {
    throw new Error(`PlanModeConfig has unknown key(s) ${unknown.join(', ')} — config is { section }`)
  }
  return { section }
}

export function foldPlanMode(events, end = events.length) {
  let active = false
  let index = 0
  for (const event of events) {
    if (index >= end) break
    index++
    if (event.type === 'plan/mode') active = event.data.active
  }
  return active
}

function hasOpenTurn(events) {
  let open = false
  for (const event of events) {
    if (event.type === 'turn/start') open = true
    else if (event.type === 'turn/end') open = false
  }
  return open
}

function planModeAtLastHeader(events) {
  let lastHeader = -1
  let index = 0
  for (const event of events) {
    if (event.type === 'request/header') lastHeader = index
    index++
  }
  if (lastHeader < 0) return undefined
  return foldPlanMode(events, lastHeader + 1)
}

export class PlanModeController extends Service {
  static inject = ['tools', 'systemPrompt']

  section

  pendingIntents = new WeakMap()

  constructor(ctx, config = { section: '' }) {
    super(ctx, 'planMode')
    this.section = resolveConfig(config).section
    let disposed = false
    ctx.on('agent/pre-step', async (
      { agent, signal },
      next,
    ) => {
      const decision = await next()
      const pending = this.pendingIntents.get(agent.session)
      if (decision.kind === 'reject' || signal.aborted || pending === undefined) return decision
      const narration = this.narration(agent.session, pending.active)
      try {
        this.onBoundary(agent.session)
      } catch (error) {
        ctx.logger.warn('freddie-plan-mode: failed to append selected plan mode at step start: %o', error)
        return decision
      }
      return !pending.narrate || narration === undefined
        ? decision
        : { ...decision, messages: [...decision.messages, narration] }
    })
    ctx.effect(() => () => { disposed = true }, 'freddie-plan-mode: close service lifetime')

    ctx.systemPrompt.section({
      name: 'plan:policy',
      order: 50,
      text: (context) => {
        if (context.agent === undefined) return ''
        const pending = this.pendingIntents.get(context.agent.session)
        return (pending?.active ?? foldPlanMode(context.agent.session.events)) ? this.section : ''
      },
    })

    ctx.inject(['sessionProjections'], (projectionCtx) => {
      projectionCtx.sessionProjections.register({
        key: 'plan',
        init: () => ({ active: false, wanted: null, running: null }),
        apply: (state, event) => {
          if (event.type === 'command/run' && event.data.name === 'plan') {
            if (event.data.args === undefined) return state
            const wanted = event.data.args.trim() !== 'off'
            return { ...state, running: { commandId: event.data.commandId, wanted } }
          }
          if (event.type === 'command/done' && event.data.commandId === state.running?.commandId) {
            const wanted = event.data.kind === 'success' && state.running.wanted !== state.active
              ? state.running.wanted
              : null
            return { ...state, wanted, running: null }
          }
          if (event.type === 'plan/mode') {
            return { ...state, active: event.data.active, wanted: null }
          }
          return state
        },
        wire: {
          view: (state) => {
            const wanted = state.running?.wanted ?? state.wanted
            return { active: state.active, pending: wanted !== null && wanted !== state.active }
          },
        },
        stateVersion: 2,
      })
    })

    ctx.inject(['commands'], (commandCtx) => {
      commandCtx.commands.register({
        name: 'plan',
        description: 'Enter or leave plan mode',
        input: { hint: '[off|message]', images: true },
        handler: ({ agent, rawInput, attachments }) => {
          const message = rawInput.trim()
          if (message === 'off' && attachments.length > 0) {
            return { kind: 'error', text: 'Image attachments cannot accompany /plan off.' }
          }
          if (message === 'off') {
            switch (this.set(agent, false)) {
              case 'committed':
                return { kind: 'success', text: 'Plan mode off.' }
              case 'queued':
                return { kind: 'success', text: 'Leaving plan mode (applies from the next step).' }
              case 'cancelled':
                return { kind: 'success', text: 'Plan mode entry cancelled.' }
              case 'noop':
                return foldPlanMode(agent.session.events)
                  ? { kind: 'success', text: 'Leaving plan mode (applies from the next step).' }
                  : { kind: 'success', text: 'Plan mode is already inactive.' }
            }
          }
          const outcome = this.set(agent, true)
          if (message !== '' || attachments.length > 0) {
            agent.steer(createUserMessage({
              content: [
                ...attachments,
                ...(message === '' ? [] : [{ type: 'text', text: message }]),
              ],
              source: { kind: 'user' },
            }))
          }
          return {
            kind: 'success',
            text: outcome === 'committed'
              ? 'Plan mode on. Use /plan off to leave.'
              : 'Entering plan mode (applies from the next step). Use /plan off to leave.',
          }
        },
      })
    })

    ctx.tools.register(defineTool({
      name: EXIT_PLAN_MODE,
      description: EXIT_DESCRIPTION,
      parameters: {
        plan: { type: 'string', required: true, description: 'The complete plan, as markdown, starting with a # heading that names it.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            approved: { type: 'boolean', const: true, required: true },
          },
        },
        render: () => [{ type: 'text', text: 'Plan approved — plan mode exited; carry out the plan starting with your next step.' }],
      },
      execute: async (args, exec) => {
        const agent = exec.agent
        if (agent === undefined) throw new Error(`${EXIT_PLAN_MODE} requires a calling agent (no session to switch)`)
        if (!foldPlanMode(agent.session.events)) {
          throw new Error(`${EXIT_PLAN_MODE} is only available in plan mode`)
        }
        if (!/^#\s+\S/.test(args.plan.trim())) {
          throw new Error(`${EXIT_PLAN_MODE} requires a non-empty markdown plan starting with a # heading`)
        }
        const interaction = ctx.get('userQuestions')
        if (interaction === undefined) {
          throw new Error('no user-questions channel is available to review the plan; ask the user to switch the session mode instead')
        }
        const answer = await interaction.ask({
          questions: [{
            id: REVIEW_ID,
            header: 'Plan review',
            question: 'Approve this plan and leave plan mode?',
            detail: args.plan,
            options: [
              { label: APPROVE_LABEL, description: 'Leave plan mode; the plan is carried out from the next step.' },
              { label: KEEP_PLANNING_LABEL, description: 'Stay in plan mode; feedback goes back to the model.' },
            ],
            intent: { kind: 'plan-review', approve: APPROVE_LABEL },
          }],
          agent,
          signal: exec.signal,
        }).catch((cause) => {
          if (cause instanceof UserQuestionError && cause.code === 'ASK_CANCELLED') {
            throw new Error('The user dismissed the plan review to speak instead; '
              + 'stay in plan mode, stop here, and wait for their message.')
          }
          throw cause
        })
        if (disposed) {
          throw new Error('the plan-mode service was reloaded while the plan was under review; present the plan again')
        }
        const reviewItems = answer.answers.filter(entry => entry.id === REVIEW_ID)
        const item = reviewItems.length === 1 ? reviewItems[0] : undefined
        if (item?.selected.length !== 1 || item.selected[0] !== APPROVE_LABEL || item.custom !== undefined) {
          const feedback = item?.custom ?? ''
          throw new Error(feedback === ''
            ? 'The user chose to keep planning; revise the plan and present it again.'
            : `The user chose to keep planning; their feedback: ${feedback}`)
        }
        this.pendingIntents.set(agent.session, { active: false, narrate: false })
        return { approved: true }
      },
      presentCall: args => ({
        card: 'generic',
        title: firstHeading(args.plan) ?? 'Plan',
        kind: 'other',
        content: [{ type: 'text', text: args.plan }],
      }),
      presentResult: (_args, result) => ({
        card: 'generic',
        title: 'Plan review',
        content: result.content,
      }),
    }))
  }

  get(agent) {
    const active = foldPlanMode(agent.session.events)
    const pending = this.pendingIntents.get(agent.session)
    return pending === undefined ? { active } : { active, pending: pending.active }
  }

  set(agent, active) {
    const session = agent.session
    const pending = this.pendingIntents.get(session)
    const target = pending?.active ?? foldPlanMode(session.events)
    if (active === target) return 'noop'
    if (hasOpenTurn(session.events)) {
      this.pendingIntents.set(session, { active, narrate: true })
      return foldPlanMode(session.events) === active ? 'cancelled' : 'queued'
    }
    if (active === foldPlanMode(session.events)) {
      this.pendingIntents.delete(session)
      return 'cancelled'
    }
    session.append('plan/mode', { active })
    this.pendingIntents.delete(session)
    const narration = this.narration(session, active)
    if (narration !== undefined) agent.inject(narration)
    return 'committed'
  }

  onBoundary(session) {
    const pending = this.pendingIntents.get(session)
    if (pending === undefined) return
    const target = pending.active
    if (target === foldPlanMode(session.events)) {
      this.pendingIntents.delete(session)
      return
    }
    session.append('plan/mode', { active: target })
    this.pendingIntents.delete(session)
  }

  narration(session, target) {
    const told = planModeAtLastHeader(session.events)
    if (told === undefined || told === target) return
    const text = target
      ? 'The user switched this session to plan mode.'
      : 'The user switched this session back to the default mode.'
    return createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: 'plan-mode', form: 'notice', summary: text },
    })
  }
}

export default PlanModeController
