import { assertNever, createToolResultMessage } from '@freddie/freddie-llm'
import { TOOL_ABORTED_BEFORE_DISPATCH, TOOL_RUNTIME_SCHEDULER } from '@freddie/freddie-tools'

export async function executeToolCalls(
  ctx,
  turn,
  step,
  toolCalls,
  signal,
  acceptContext,
) {
  const agent = ctx.agents.requireInitiator()
  const { session } = agent

  const planned = toolCalls.map(block => ({
    block,
    exec: {
      callId: block.id,
      name: block.name,
      arguments: parseArguments(block.arguments),
      agent,
      signal,
    },
  }))

  let next = 0
  let concluded = false
  while (next < planned.length) {
    const first = planned[next]
    const mode = ctx.tools.executionMode(first.exec).kind
    const group = mode === 'parallel' ? planned.slice(next) : [first]
    const outcome = await runGroup(
      ctx, turn, step, group, mode, signal, acceptContext,
    )
    next += outcome.consumed
    concluded ||= outcome.concluded
    if (outcome.aborted) {
      for (const call of planned.slice(next)) appendSkippedToolCall(session, turn, step, call.block)
      return { concluded }
    }
  }
  return { concluded }
}

function parseArguments(raw) {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return raw
  }
}

async function runGroup(
  ctx,
  turn,
  step,
  group,
  mode,
  signal,
  acceptContext,
) {
  const { session } = ctx.agents.requireInitiator()
  const { maxParallelToolCalls } = ctx.agentLoop.config
  const slots = group.map(() => undefined)
  const callSeqs = group.map(() => -1)
  let nextToStart = 0
  let committed = 0
  let started = 0
  let aborted = signal.aborted
  let concluded = false
  let schedulerFailure
  const throwSchedulerFailure = () => {
    if (schedulerFailure !== undefined) throw schedulerFailure.error
  }

  const commitReady = async () => {
    while (committed < group.length) {
      const slot = slots[committed]
      if (slot === undefined) break
      const call = group[committed]
      const result = slot.needsPost
        ? await ctx.tools[TOOL_RUNTIME_SCHEDULER].finalize(slot.exec, slot.result)
        : ctx.tools[TOOL_RUNTIME_SCHEDULER].finish(slot.exec, slot.result)
      appendToolResult(session, turn, step, call.block, result, callSeqs[committed])
      for (const context of result.additionalContexts ?? []) acceptContext(context)
      concluded ||= result.concludesTurn === true
      committed++
    }
  }

  const inFlight = new Map()

  const startCall = async (index) => {
    const call = group[index]
    callSeqs[index] = appendToolCall(session, turn, step, call.block)
    started++
    const prepared = await ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare(call.exec)
    throwSchedulerFailure()
    switch (prepared.kind) {
      case 'dispatch': {
        const promise = ctx.tools[TOOL_RUNTIME_SCHEDULER].dispatch(prepared.exec).then(
          (outcome) => {
            slots[index] = { exec: prepared.exec, result: outcome.result, needsPost: outcome.kind === 'post-result' }
            return index
          },
          (error) => {
            schedulerFailure ??= { error }
            return index
          },
        )
        inFlight.set(index, promise)
        break
      }
      case 'post-result':
        slots[index] = { exec: prepared.exec, result: prepared.result, needsPost: true }
        break
      case 'final-result':
        slots[index] = { exec: prepared.exec, result: prepared.result, needsPost: false }
        break
      default:
        assertNever(prepared, 'tool-call scheduler prepare result')
    }
  }

  const fillPool = async () => {
    while (!aborted && nextToStart < group.length && inFlight.size < maxParallelToolCalls) {
      const nextCall = group[nextToStart]
      if (nextToStart > 0 && mode === 'parallel'
        && ctx.tools.executionMode(nextCall.exec).kind !== 'parallel') break
      await startCall(nextToStart)
      nextToStart++
      throwSchedulerFailure()
      await commitReady()
      throwSchedulerFailure()
      if (signal.aborted) aborted = true
    }
  }

  try {
    await fillPool()
    while (inFlight.size > 0) {
      const settledIndex = await Promise.race(inFlight.values())
      inFlight.delete(settledIndex)
      throwSchedulerFailure()
      await commitReady()
      throwSchedulerFailure()
      if (signal.aborted) aborted = true
      await fillPool()
    }
  } catch (error) {
    schedulerFailure ??= { error }
    await Promise.allSettled(inFlight.values())
    throw schedulerFailure.error
  }

  if (aborted) {
    for (const call of group.slice(started)) appendSkippedToolCall(session, turn, step, call.block)
    return { consumed: group.length, aborted: true, concluded }
  }
  if (committed !== started) throw new Error('tool-call scheduler: uncommitted settled calls')
  return { consumed: started, aborted: false, concluded }
}

function appendSkippedToolCall(session, turn, step, block) {
  const callSeq = appendToolCall(session, turn, step, block)
  appendToolResult(session, turn, step, block, {
    content: [{ type: 'text', text: 'Error: tool call aborted before dispatch' }],
    isError: true,
    error: {
      message: 'tool call aborted before dispatch',
      info: { name: 'AbortError', code: TOOL_ABORTED_BEFORE_DISPATCH },
    },
  }, callSeq)
}

function appendToolCall(session, turn, step, block) {
  const event = session.append('tool/call', { turn, step, callId: block.id, name: block.name, arguments: block.arguments })
  return event.seq
}

function appendToolResult(
  session,
  turn,
  step,
  block,
  result,
  callSeq,
) {
  const message = createToolResultMessage({
    callId: block.id,
    content: result.content,
    isError: result.isError,
  })
  session.append('tool/result', {
    turn, step,
    message,
    ...result.error?.info ? { error: result.error.info } : {},
    ...result.meta !== undefined ? { meta: result.meta } : {},
  }, { surfaceOp: 'append', sourceEventSeqs: [callSeq] })
}
