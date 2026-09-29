import { readFileSync } from 'node:fs'
import z from '@freddie/schemastery'
import { createUserMessage } from '@freddie/freddie-llm'
import {
  appendHookInvoked,
  appendHookResult,
  createDetachedRuns,
  DEFAULT_HOOK_TIMEOUT_MS,
  DEFAULT_STDERR_SUMMARY_MAX_CHARS,
  matchesMatcher,
  mergeHookOutputs,
  runHook,
} from '@freddie/freddie-hook-protocol'
import { parseCodexConfig } from './config.js'

export const name = 'hooks-codex'
export const inject = ['shell']


export const Config = z.object({
  configPath: z.string().required(),
  model: z.string().default(''),
  defaultTimeoutMs: z.number().default(DEFAULT_HOOK_TIMEOUT_MS),
  stderrSummaryMaxChars: z.number().default(DEFAULT_STDERR_SUMMARY_MAX_CHARS),
})

let handlerCounter = 0
function nextHandlerId(point) {
  return `codex:${point}:${++handlerCounter}`
}

const CONTEXT_SOURCE = { kind: 'plugin', plugin: 'hooks-codex' }

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`hooks-codex: ${name} must be a positive integer`)
  }
}

function lastTurn(agent) {
  if (!agent) return 0
  const start = agent.session.events.findLast(event => event.type === 'turn/start')
  return start?.data.turn ?? 0
}

export function apply(ctx, config) {
  const stderrSummaryMaxChars = config.stderrSummaryMaxChars ?? DEFAULT_STDERR_SUMMARY_MAX_CHARS
  assertPositiveInteger('stderrSummaryMaxChars', stderrSummaryMaxChars)
  const defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS
  let parsed = {}
  try {
    const raw = JSON.parse(readFileSync(config.configPath, 'utf8'))
    const result = parseCodexConfig(raw)
    parsed = result.config
    for (const s of result.skipped) {
      ctx.logger.warn(`hooks-codex: skipping ${s.reason} on ${s.event} (only sync command hooks run)`)
    }
  } catch (error) {
    ctx.logger.warn(`hooks-codex: could not load hook config "${config.configPath}": ${String(error)} — no hooks registered`)
    return
  }

  const model = config.model ?? ''

  const detached = createDetachedRuns()
  ctx.effect(() => () => detached.drain(), 'hooks-codex: drain detached hook runs')

  async function runPoint(point, matchQuery, payload, opts) {
    const groups = parsed[point] ?? []
    const outputs = []
    const workdir = opts.agent?.session.header.cwd
    for (const group of groups) {
      if (!matchesMatcher(group.matcher, matchQuery, 'codex')) continue
      for (const hook of group.hooks) {
        const handlerId = nextHandlerId(point)
        const session = opts.agent?.session
        if (session && opts.turn !== undefined) {
          appendHookInvoked(session, {
            turn: opts.turn, point, dialect: 'codex', handlerId,
            ...group.matcher !== undefined ? { matcher: group.matcher } : {},
          })
        }
        const { output, durationMs } = await runHook(ctx.shell, hook, {
          payload,
          defaultTimeoutMs,
          ...workdir !== undefined ? { cwd: workdir } : {},
          signal: opts.signal,
          trailingNewline: false,
          expectedEventName: point,
        }, () => performance.now())
        if (opts.plainStdoutAsContext === true && output.exitCode === 0
          && output.additionalContext === undefined
          && output.stdout.length > 0 && !output.stdout.startsWith('{')) {
          output.additionalContext = output.stdout
        }
        outputs.push(output)
        if (output.systemMessage !== undefined) {
          ctx.logger.warn(`hooks-codex: ${point} hook emitted a systemMessage, which is not yet surfaced (ignored)`)
        }
        if (session && opts.turn !== undefined) {
          appendHookResult(session, { turn: opts.turn, point, handlerId, output, stderrSummaryMaxChars, durationMs })
        }
      }
    }
    return mergeHookOutputs(outputs)
  }

  function contextFrom(merged) {
    if (merged.additionalContext.length === 0) return undefined
    const content = merged.additionalContext.map(text => ({ type: 'text', text }))
    return createUserMessage({ content, source: CONTEXT_SOURCE })
  }

  function prependContext(ours, theirs) {
    return [ours, ...theirs ?? []]
  }

  ctx.on('agent/created', async ({ agent }) => {
    const ownerSignal = detached.signal
    const source = 'startup'
    const run = runPoint('SessionStart', source, { ...base(agent, 'SessionStart', model), source }, { agent, plainStdoutAsContext: true, signal: ownerSignal })
      .then((merged) => {
        const context = contextFrom(merged)
        if (context) agent.inject(context)
      })
      .catch((error) => { ctx.logger.warn(`hooks-codex: SessionStart hook failed: ${String(error)}`) })
    detached.track(run)
    await run
  })

  ctx.on('agent/pre-step', async ({ agent, messages, turn, signal }, next) => {
    if (messages.length === 0) return next()
    const payload = {
      ...base(agent, 'UserPromptSubmit', model),
      turn_id: String(turn),
      prompt: blocksToText(messages.flatMap(message => message.content)),
    }
    const merged = await runPoint('UserPromptSubmit', '', payload, {
      agent, turn, plainStdoutAsContext: true, signal,
    })
    if (merged.decision === 'deny') {
      return { kind: 'reject' }
    }
    const downstream = await next()
    const ours = contextFrom(merged)
    if (!ours || downstream.kind !== 'enter') return downstream
    return {
      ...downstream,
      messages: [...downstream.messages, ours],
    }
  })

  ctx.on('tools/pre-execute', async (exec, next) => {
    const turn = lastTurn(exec.agent)
    const merged = await runPoint('PreToolUse', exec.name, preToolPayload(exec, model), { ...exec.agent ? { agent: exec.agent } : {}, turn, signal: exec.signal })
    if (merged.decision === 'deny') return { kind: 'deny', reason: merged.reason ?? 'blocked by PreToolUse hook' }
    return next()
  })

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const turn = lastTurn(exec.agent)
    const merged = await runPoint('PostToolUse', exec.name, postToolPayload(exec, result, model), { ...exec.agent ? { agent: exec.agent } : {}, turn, signal: exec.signal })
    const context = contextFrom(merged)
    if (merged.decision === 'deny') {
      return { kind: 'block', feedback: [{ type: 'text', text: merged.reason ?? 'blocked by PostToolUse hook' }], ...context ? { additionalContexts: [context] } : {} }
    }
    const downstream = await next()
    if (!context) return downstream
    if (downstream.kind === 'block') {
      return { ...downstream, additionalContexts: prependContext(context, downstream.additionalContexts) }
    }
    return {
      ...downstream,
      additionalContexts: prependContext(context, downstream.additionalContexts),
    }
  })

  ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
    const merged = await runPoint('Stop', '', { ...turnBase(agent, 'Stop', model), stop_hook_active: false, last_assistant_message: null }, { agent, turn, signal })
    if (merged.decision === 'deny') {
      const text = merged.reason ?? 'continue: blocked by Stop hook'
      agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: CONTEXT_SOURCE }))
    }
  })
}


function blocksToText(content) {
  return content.filter(b => b.type === 'text').map(b => b.text).join('')
}

function base(agent, event, model) {
  return {
    session_id: agent?.session.header.id ?? '',
    transcript_path: null,
    cwd: agent?.session.header.cwd ?? process.cwd(),
    hook_event_name: event,
    model,
    permission_mode: 'default',
  }
}

function turnBase(agent, event, model) {
  return { ...base(agent, event, model), turn_id: String(lastTurn(agent)) }
}

function commandOf(args) {
  if (typeof args === 'object' && args !== null && 'command' in args) {
    const command = args.command
    if (typeof command === 'string') return command
  }
  return ''
}

function preToolPayload(exec, model) {
  return { ...turnBase(exec.agent, 'PreToolUse', model), tool_name: exec.name, tool_input: { command: commandOf(exec.arguments) }, tool_use_id: exec.callId }
}

function postToolPayload(exec, result, model) {
  return { ...turnBase(exec.agent, 'PostToolUse', model), tool_name: exec.name, tool_input: { command: commandOf(exec.arguments) }, tool_use_id: exec.callId, tool_response: blocksToText(result.content) }
}
