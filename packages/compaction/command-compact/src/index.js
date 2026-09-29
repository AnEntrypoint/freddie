
import { ManualCompactionError } from '@freddie/freddie-compaction'

export const name = 'command-compact'
export const inject = ['commands', 'compaction']

const USAGE = 'Usage: /compact (no arguments)'

/* v8 ignore start -- closed-union backstop is unreachable without violating the TypeScript contract */
function assertNever(value) {
  throw new TypeError(`unknown manual compaction error code: ${String(value)}`)
}
/* v8 ignore stop */

function expectedFailure(error) {
  switch (error.code) {
    case 'busy':
      return {
        kind: 'error',
        text: 'Compaction is unavailable because this process has an active compaction, or the agent is not idle.',
      }
    case 'cancelled':
      return { kind: 'error', text: 'Compaction cancelled.' }
    case 'changed':
      return {
        kind: 'error',
        text: 'The history selected for compaction changed before it could be replaced. The conversation is unchanged; the attempt is recorded in the session log.',
      }
    case 'summary':
      return {
        kind: 'error',
        text: 'Compaction could not produce a useful summary. The conversation is unchanged; the attempt is recorded in the session log.',
      }
    case 'commit':
      return {
        kind: 'error',
        text: 'Compaction did not finish cleanly; some session history may have changed. Inspect the current session state before retrying.',
      }
    case 'persistence':
      return {
        kind: 'error',
        text: 'Compaction finished, but the session could not be saved.',
      }
    /* v8 ignore next 2 -- ManualCompactionErrorCode is closed and every member is handled above */
    default: return assertNever(error.code)
  }
}

async function executeCompact(ctx, invocation) {
  if (invocation.rawInput.trim().length > 0) {
    return { kind: 'error', text: USAGE }
  }
  try {
    const result = await ctx.compaction.compactNow(invocation.agent, invocation.signal, invocation.commandId)
    if (result === null) return { kind: 'success', text: 'No compactable history yet.' }
    return {
      kind: 'success',
      text: `Compacted ${result.shadowedSeqs.length} history items (~${result.shadowedTokenCount} tokens).`,
      sourceEventSeq: result.summarySeq,
    }
  } catch (error) {
    if (invocation.signal.aborted) return { kind: 'error', text: 'Compaction cancelled.' }
    if (error instanceof ManualCompactionError) return expectedFailure(error)
    throw error
  }
}

export function apply(ctx) {
  const active = new Set()
  const handler = (invocation) => {
    const operation = executeCompact(ctx, invocation)
    active.add(operation)
    const retire = () => { active.delete(operation) }
    void operation.then(retire, retire)
    return operation
  }

  ctx.effect(function* () {
    yield async () => { await Promise.allSettled(active) }
    yield ctx.commands.register({
      name: 'compact',
      description: 'Compact older conversation history',
      handler,
    })
  }, 'command-compact lifecycle')
}
