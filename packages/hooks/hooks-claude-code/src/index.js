/**
 * Bridge for unmodified Claude Code command hooks on harness interception
 * extension points. It supports SessionStart, prompt/tool pre/post, Stop, and subagent
 * start/stop. It owns Claude payloads, environment, substitution, and decision
 * mapping; shared execution and parsing live in `@freddie/freddie-hook-protocol`.
 * `updatedInput` is logged and warned but not honored. Bespoke behavior should
 * use typed native plugins on the same extension points.
 */

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
import { parseClaudeCodeConfig } from './config.js'

export const name = 'hooks-claude-code'
export const inject = ['shell']

/**
 * @typedef {object} Config
 * @property {string} configPath - Path to a `hooks.json` or a settings file whose `hooks` key holds
 *   the config. Process-level: read once at load, a relative path resolves against the process
 *   launch cwd, so one config applies to the whole process.
 * @property {string} [pluginRoot] - Replaces `${CLAUDE_PLUGIN_ROOT}` in command strings (the plugin's root dir).
 * @property {string} [projectDir] - Replaces `${CLAUDE_PROJECT_DIR}` in command strings AND is exported as the
 *   `CLAUDE_PROJECT_DIR` env var for hook processes. When omitted, the env var defaults per-run to
 *   the agent's session workspace (`session.header.cwd`, the same dir the hook runs in).
 * @property {number} [defaultTimeoutMs] - Default per-hook timeout in ms when a hook sets none (CC default: 600000).
 * @property {number} [stderrSummaryMaxChars] - Character cap for the `hook/result` event's persisted stderr summary.
 */

export const Config = z.object({
  configPath: z.string().required(),
  pluginRoot: z.string(),
  projectDir: z.string(),
  defaultTimeoutMs: z.number().default(DEFAULT_HOOK_TIMEOUT_MS),
  stderrSummaryMaxChars: z.number().default(DEFAULT_STDERR_SUMMARY_MAX_CHARS),
})

/** A stable per-handler id so an invoked/result pair correlates in the log. */
let handlerCounter = 0
function nextHandlerId(point) {
  return `claude-code:${point}:${++handlerCounter}`
}

/** The `{kind:'plugin', plugin:'hooks-claude-code'}` producer source stamped on every context this bridge injects. */
const CONTEXT_SOURCE = { kind: 'plugin', plugin: 'hooks-claude-code' }

/** The summary cap bounds a persisted event field — a positive integer or the slice misbehaves silently. */
function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`hooks-claude-code: ${name} must be a positive integer`)
  }
}

/**
 * The last open turn number in the session's log, or 0 without one — read
 * directly from `session.events` rather than a registered `sessionProjections`
 * `turnBoundary` unit, which freddie has no counterpart for (matching how
 * `@freddie/freddie-tool-present` and `@freddie/freddie-agent-loop` itself
 * derive the same fact).
 * @param {import('@freddie/freddie-agent').Agent | undefined} agent
 * @returns {number}
 */
function lastTurn(agent) {
  if (!agent) return 0
  const start = agent.session.events.findLast(event => event.type === 'turn/start')
  return start?.data.turn ?? 0
}

/**
 * @param {import('@freddie/cordis').Context} ctx - host context with `shell`.
 * @param {{ configPath: string; pluginRoot?: string; projectDir?: string; defaultTimeoutMs: number; stderrSummaryMaxChars: number }} config
 */
export function apply(ctx, config) {
  const stderrSummaryMaxChars = config.stderrSummaryMaxChars ?? DEFAULT_STDERR_SUMMARY_MAX_CHARS
  assertPositiveInteger('stderrSummaryMaxChars', stderrSummaryMaxChars)
  const defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS
  let parsed = {}
  try {
    const raw = JSON.parse(readFileSync(config.configPath, 'utf8'))
    const result = parseClaudeCodeConfig(raw, {
      ...config.pluginRoot !== undefined ? { pluginRoot: config.pluginRoot } : {},
      ...config.projectDir !== undefined ? { projectDir: config.projectDir } : {},
    })
    parsed = result.config
    for (const s of result.skipped) {
      ctx.logger.warn(`hooks-claude-code: skipping unsupported "${s.type}" hook on ${s.event} (only command hooks run)`)
    }
  } catch (error) {
    ctx.logger.warn(`hooks-claude-code: could not load hook config "${config.configPath}": ${String(error)} — no hooks registered`)
    return
  }

  const detached = createDetachedRuns()
  const subagentChildren = new Map()
  ctx.effect(() => () => detached.drain(), 'hooks-claude-code: drain detached hook runs')

  /**
   * Run every command hook configured for `point` whose matcher selects
   * `matchQuery`, with the per-event `payload` on stdin, and fold the results.
   * Writes a `hook/invoked`/`hook/result` pair per hook when `opts.turn` names
   * an open turn. Detached lifecycle points omit the pair. Returns the merged outcome (a neutral,
   * already-most-restrictive view) for the caller to map onto its extension point
   * decision. `matchQuery` is the event's matcher subject (tool name, session
   * source, …); `''` for events that ignore matchers.
   */
  async function runPoint(point, matchQuery, payload, opts) {
    const groups = parsed[point] ?? []
    const outputs = []
    const workdir = opts.agent?.session.header.cwd
    const projectDir = config.projectDir ?? workdir
    const hookEnv = projectDir !== undefined ? { CLAUDE_PROJECT_DIR: projectDir } : undefined
    for (const group of groups) {
      if (!matchesMatcher(group.matcher, matchQuery, 'claude-code')) continue
      for (const hook of group.hooks) {
        const handlerId = nextHandlerId(point)
        const session = opts.agent?.session
        if (session && opts.turn !== undefined) {
          appendHookInvoked(session, {
            turn: opts.turn, point, dialect: 'claude-code', handlerId,
            ...group.matcher !== undefined ? { matcher: group.matcher } : {},
          })
        }
        const { output, durationMs } = await runHook(ctx.shell, hook, {
          payload,
          defaultTimeoutMs,
          ...hookEnv ? { env: hookEnv } : {},
          ...workdir !== undefined ? { cwd: workdir } : {},
          signal: opts.signal,
          trailingNewline: true,
          expectedEventName: point,
        }, () => performance.now())
        outputs.push(output)
        if (output.updatedInput !== undefined) {
          ctx.logger.warn(`hooks-claude-code: ${point} hook requested updatedInput, which is not yet honored (ignored)`)
        }
        if (output.systemMessage !== undefined) {
          ctx.logger.warn(`hooks-claude-code: ${point} hook emitted a systemMessage, which is not yet surfaced (ignored)`)
        }
        if (session && opts.turn !== undefined) {
          appendHookResult(session, { turn: opts.turn, point, handlerId, output, stderrSummaryMaxChars, durationMs })
        }
      }
    }
    return mergeHookOutputs(outputs)
  }

  /** Build additional model context from hook output, or return undefined when empty. */
  function contextFrom(merged) {
    if (merged.additionalContext.length === 0) return undefined
    const content = merged.additionalContext.map(text => ({ type: 'text', text }))
    return createUserMessage({ content, source: CONTEXT_SOURCE })
  }

  /** Prepend one context without flattening source fields or other downstream metadata. */
  function prependContext(ours, theirs) {
    return [ours, ...theirs ?? []]
  }

  ctx.on('agent/created', async ({ agent }) => {
    const ownerSignal = detached.signal
    const source = 'startup'
    const run = runPoint('SessionStart', source, sessionStartPayload(agent, source), { agent, signal: ownerSignal })
      .then((merged) => {
        const context = contextFrom(merged)
        if (context) agent.inject(context)
      })
      .catch((error) => {
        ctx.logger.warn(`hooks-claude-code: SessionStart hook failed: ${String(error)}`)
      })
    detached.track(run)
    await run
  })

  ctx.on('agent/pre-step', async ({ agent, messages, turn, signal }, next) => {
    if (messages.length === 0) return next()
    const content = messages.flatMap(message => message.content)
    const merged = await runPoint('UserPromptSubmit', '', promptPayload(agent, content), { agent, turn, signal })
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
    const merged = await runPoint('PreToolUse', exec.name, preToolPayload(exec), { ...exec.agent ? { agent: exec.agent } : {}, turn, signal: exec.signal })
    if (merged.decision === 'deny') return { kind: 'deny', reason: merged.reason ?? 'blocked by PreToolUse hook' }
    if (merged.decision === 'ask') return { kind: 'ask', ...merged.reason !== undefined ? { reason: merged.reason } : {} }
    return next()
  })

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const turn = lastTurn(exec.agent)
    const merged = await runPoint('PostToolUse', exec.name, postToolPayload(exec, result), { ...exec.agent ? { agent: exec.agent } : {}, turn, signal: exec.signal })
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
    const merged = await runPoint('Stop', '', stopPayload(agent), { agent, turn, signal })
    if (merged.decision === 'deny') {
      const text = merged.reason ?? 'continue: blocked by Stop hook'
      agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: CONTEXT_SOURCE }))
    }
  })

  ctx.on('subagent/start', (info) => {
    const child = ctx.get('agents')?.get(info.id)
    if (child !== undefined) subagentChildren.set(info.runId, child)
    detached.track(runPoint('SubagentStart', SUBAGENT_TYPE, subagentPayload('SubagentStart', info, child), { ...child ? { agent: child } : {}, signal: detached.signal })
      .then((merged) => {
        const context = contextFrom(merged)
        if (context && child) child.inject(context)
      })
      .catch((error) => { ctx.logger.warn(`hooks-claude-code: SubagentStart hook failed: ${String(error)}`) }))
  })
  ctx.on('subagent/end', (info) => {
    const child = subagentChildren.get(info.runId) ?? ctx.get('agents')?.get(info.id)
    subagentChildren.delete(info.runId)
    detached.track(runPoint('SubagentStop', SUBAGENT_TYPE, subagentPayload('SubagentStop', info, child), { ...child ? { agent: child } : {}, signal: detached.signal }))
  })
}

/**
 * The `agent_type` value the bridge reports for SubagentStart/Stop. The harness
 * subagent seam carries no per-kind label, so the bridge uses Claude Code's own
 * Task-tool default — a hooks.json with a default/`*`/empty `agent_type` matcher
 * fires; a config matching a specific kind (e.g. `code-reviewer`) does not.
 */
const SUBAGENT_TYPE = 'general-purpose'


/** Flatten content blocks to the text a hook payload carries (the common case). */
function blocksToText(content) {
  return content.filter(b => b.type === 'text').map(b => b.text).join('')
}

function base(agent, event) {
  return {
    session_id: agent?.session.header.id ?? '',
    transcript_path: '',
    cwd: agent?.session.header.cwd ?? process.cwd(),
    hook_event_name: event,
  }
}

function sessionStartPayload(agent, source) {
  return { ...base(agent, 'SessionStart'), source }
}
function promptPayload(agent, content) {
  return { ...base(agent, 'UserPromptSubmit'), prompt: blocksToText(content) }
}
function preToolPayload(exec) {
  return { ...base(exec.agent, 'PreToolUse'), tool_name: exec.name, tool_input: exec.arguments, tool_use_id: exec.callId }
}
function postToolPayload(exec, result) {
  return { ...base(exec.agent, 'PostToolUse'), tool_name: exec.name, tool_input: exec.arguments, tool_use_id: exec.callId, tool_response: blocksToText(result.content) }
}
function stopPayload(agent) {
  return { ...base(agent, 'Stop'), stop_hook_active: false }
}
/**
 * Build a SubagentStart/SubagentStop payload from the CC base (the child's
 * `session_id`/`cwd` when the child agent is available) plus the subagent-hook
 * fields. `agent_type` is the CC-default {@link SUBAGENT_TYPE}; `stop_hook_active`
 * is present on SubagentStop only (the loop-guard flag, always false).
 */
function subagentPayload(event, info, child) {
  return {
    ...base(child, event),
    agent_id: info.id,
    agent_type: SUBAGENT_TYPE,
    ...event === 'SubagentStop' ? { stop_hook_active: false } : {},
  }
}
