import { randomUUID } from 'node:crypto'
import { query as officialQuery } from '@anthropic-ai/claude-agent-sdk'
import { SessionId } from '@freddie/freddie-session'
import { settleRunResult, subprocessRunHandle } from '@freddie/freddie-subagent'
import { scrubbedParentEnv } from '@freddie/freddie-subprocess'
import { claudeSpawnSpec, ManagedClaudeCodeProcess } from './process.js'

export const DEFAULT_DISPOSE_GRACE_MS = 3_000

export const CLAUDE_CODE_PERMISSION_MODES = [
  'dontAsk',
  'acceptEdits',
  'auto',
  'plan',
  'bypassPermissions',
]

export const DEFAULT_CLAUDE_CODE_PERMISSION_MODE = 'dontAsk'

const SUPPORTED_UNATTENDED_DIALOG_KINDS = ['refusal_fallback_prompt']

function failureDiagnostic(facts) {
  const fields = [
    'product: Claude Code',
    `stage: ${facts.stage}`,
    `category: ${facts.category}`,
  ]
  const exitCode = facts.outcome?.exitCode
  if (exitCode !== null && exitCode !== undefined) {
    fields.push(`exit code: ${exitCode}`)
  }
  const signal = facts.outcome?.signal
  if (signal !== null && signal !== undefined) {
    fields.push(`signal: ${signal}`)
  }
  return `Product subagent failure (${fields.join('; ')})`
}

class ClaudeCodeFailure extends Error {
  constructor(facts, cause) {
    super(
      `subagent-claude-code: ${failureDiagnostic(facts)}`,
      cause === undefined ? undefined : { cause },
    )
    this.name = 'ClaudeCodeFailure'
    this.facts = facts
  }
}

function sdkFailureCategory(subtype) {
  switch (subtype) {
    case 'error_max_turns':
    case 'error_max_budget_usd':
    case 'error_max_structured_output_retries':
      return 'limit'
    case 'error_during_execution':
      return 'product-error'
    default:
      return 'unknown'
  }
}

export function claudeCodeStartupFailure(cause) {
  return new ClaudeCodeFailure({ stage: 'query-start', category: 'unknown' }, cause)
}

function unattendedDiagnostic(mode, request, decision, reason) {
  return `Claude Code unattended decision (mode: ${mode}; request: ${request}; decision: ${decision}): ${reason}`
}

function thrown(value) {
  return value instanceof Error ? value : new Error(String(value))
}

function isAborted(signal) {
  return signal.aborted
}

export function textTask(prompt) {
  if (prompt.length === 0) {
    throw new Error('subagent-claude-code: the one-shot task must contain only text blocks')
  }
  const texts = []
  for (const block of prompt) {
    if (block.type !== 'text') {
      throw new Error('subagent-claude-code: the one-shot task must contain only text blocks')
    }
    texts.push(block.text)
  }
  if (texts.every(text => text.trim().length === 0)) {
    throw new Error('subagent-claude-code: the one-shot task must not be empty')
  }
  return texts.join('')
}

export function successfulResult(message) {
  if (message.subtype !== 'success') {
    const category = sdkFailureCategory(message.subtype)
    const detail = category === 'unknown' ? undefined : message.errors.join('; ')
    throw new ClaudeCodeFailure(
      { stage: 'query-run', category },
      detail === undefined || detail.length === 0 ? undefined : new Error(detail),
    )
  }
  if (message.is_error || message.result.trim().length === 0) {
    throw new ClaudeCodeFailure({ stage: 'query-run', category: 'invalid-result' })
  }
  return message.result
}

export async function consumeClaudeQuery(query, onPermissionDenied, onResult) {
  let answer
  for await (const message of query) {
    if (message.type === 'system' && message.subtype === 'permission_denied') {
      onPermissionDenied?.()
      continue
    }
    if (message.type !== 'result') continue
    onResult?.()
    answer = successfulResult(message)
  }
  if (answer === undefined) {
    throw new ClaudeCodeFailure({ stage: 'query-run', category: 'invalid-result' })
  }
  return {
    output: [{ type: 'text', text: answer }],
    stopReason: 'completed',
  }
}


export async function disposeClaudeCodeChild(query, child) {
  const failures = []
  let outcome
  void child.done.then(
    (value) => { outcome = value },
    () => {},
  )
  try {
    query?.close()
  } catch (error) {
    failures.push(thrown(error))
  }

  child.terminate()
  try {
    await child.waitForExit()
  } catch (error) {
    failures.push(thrown(error))
  }

  const firstFailure = failures[0]
  if (firstFailure !== undefined) {
    const facts = { stage: 'teardown', category: 'unknown', outcome }
    const cause = failures.length === 1
      ? firstFailure
      : new AggregateError(failures, 'Claude Code teardown failures')
    throw new ClaudeCodeFailure(facts, cause)
  }
  await child.done.catch(() => {})
}

export function claudeQueryOptions(spec, controller, capture, captureDiagnostic) {
  return {
    abortController: controller,
    cwd: spec.cwd,
    ...spec.model === undefined ? {} : { model: spec.model },
    env: { ...scrubbedParentEnv(), ...spec.env },
    persistSession: false,
    disallowedTools: spec.permissionMode === 'plan'
      ? ['AskUserQuestion', 'ExitPlanMode']
      : ['AskUserQuestion'],
    permissionMode: spec.permissionMode,
    ...spec.permissionMode === 'bypassPermissions'
      ? { allowDangerouslySkipPermissions: true }
      : {
        canUseTool: () => {
          captureDiagnostic(unattendedDiagnostic(
            spec.permissionMode,
            'tool permission',
            'denied',
            'the provider does not request human approval',
          ))
          return Promise.resolve({
            behavior: 'deny',
            message: 'This unattended Claude Code subagent cannot request human approval.',
          })
        },
      },
    onElicitation: () => {
      captureDiagnostic(unattendedDiagnostic(
        spec.permissionMode,
        'MCP elicitation',
        'declined',
        'the provider does not collect interactive MCP input',
      ))
      return Promise.resolve({ action: 'decline' })
    },
    onUserDialog: () => {
      captureDiagnostic(unattendedDiagnostic(
        spec.permissionMode,
        'user dialog',
        'cancelled',
        'the provider does not render blocking dialogs',
      ))
      return Promise.resolve({ behavior: 'cancelled' })
    },
    supportedDialogKinds: SUPPORTED_UNATTENDED_DIALOG_KINDS,
    spawnClaudeCodeProcess: (options) => {
      const child = spec.spawn(claudeSpawnSpec(options, spec.disposeGraceMs))
      const process = new ManagedClaudeCodeProcess(child)
      capture(child, process)
      return process
    },
  }
}

export async function startClaudeCodeRun(request, spec) {
  const prompt = textTask(request.prompt)
  if (request.signal.aborted) {
    throw new Error('subagent-claude-code: request was aborted before SDK startup')
  }

  const controller = new AbortController()
  const requestCancel = () => {
    if (!controller.signal.aborted) {
      controller.abort(new Error('subagent-claude-code: run cancelled locally'))
    }
  }
  const onAbort = () => { requestCancel() }
  request.signal.addEventListener('abort', onAbort, { once: true })
  const reportFailure = (error) => {
    try {
      spec.onError?.(error, 'error')
    } catch {
    }
  }

  let child
  let childFailure
  let childProcessFailure
  let query
  let managedProcess
  let diagnostic
  const capturePermissionDiagnostic = (value) => {
    diagnostic = value
  }
  const prependFailureDiagnostic = (facts) => {
    const failure = failureDiagnostic(facts)
    diagnostic = diagnostic === undefined ? failure : `${failure}\n${diagnostic}`
  }
  const captureChild = (captured, process) => {
    child = captured
    managedProcess = process
    childProcessFailure = captured.done.then(
      () => new Promise(() => {}),
      (error) => {
        childFailure = thrown(error)
        throw childFailure
      },
    )
    void childProcessFailure.catch(() => {})
  }
  try {
    query = officialQuery({
      prompt,
      options: claudeQueryOptions(spec, controller, captureChild, capturePermissionDiagnostic),
    })
    if (child === undefined || childProcessFailure === undefined) {
      throw new Error('subagent-claude-code: official SDK did not publish a controllable Claude Code process')
    }
    if (isAborted(controller.signal)) {
      throw new Error('subagent-claude-code: request was aborted before SDK startup')
    }
  } catch (error) {
    request.signal.removeEventListener('abort', onAbort)
    const cancelledBeforeCleanup = controller.signal.aborted
    await Promise.resolve()
    const startupOutcome = managedProcess?.outcome
    const startupFacts = { stage: 'query-start', category: 'unknown', outcome: startupOutcome }
    const startupFailure = (cause = childFailure ?? error) => new ClaudeCodeFailure(startupFacts, thrown(cause))
    requestCancel()
    if (child !== undefined) {
      try {
        await disposeClaudeCodeChild(query, child)
      } catch (disposeError) {
        const failure = startupFailure()
        const cleanupFailure = thrown(disposeError)
        const aggregate = new AggregateError([failure, cleanupFailure], `${failure.message}; ${cleanupFailure.message}`)
        reportFailure(aggregate)
        throw aggregate
      }
      if (cancelledBeforeCleanup || isAborted(request.signal)) {
        throw new Error('subagent-claude-code: request was aborted before SDK startup')
      }
      const failure = startupFailure()
      reportFailure(failure)
      throw failure
    } else if (query !== undefined) {
      try {
        query.close()
      } catch (disposeError) {
        const failure = startupFailure()
        const cleanupFailure = new ClaudeCodeFailure({ stage: 'teardown', category: 'unknown' }, thrown(disposeError))
        const aggregate = new AggregateError([failure, cleanupFailure], `${failure.message}; ${cleanupFailure.message}`)
        reportFailure(aggregate)
        throw aggregate
      }
    }
    if (cancelledBeforeCleanup || isAborted(request.signal)) {
      throw new Error('subagent-claude-code: request was aborted before SDK startup')
    }
    const failure = startupFailure()
    reportFailure(failure)
    throw failure
  }

  const publishedQuery = query
  const publishedChild = child
  const publishedProcessFailure = childProcessFailure
  let receivedResult = false
  const result = settleRunResult({
    attempt: async () => {
      try {
        return await Promise.race([
          consumeClaudeQuery(publishedQuery, () => {
            capturePermissionDiagnostic(unattendedDiagnostic(
              spec.permissionMode,
              'tool permission',
              'denied',
              'Claude Code denied the request before an interactive prompt',
            ))
          }, () => {
            receivedResult = true
          }),
          publishedProcessFailure,
        ])
      } catch (error) {
        const processOutcome = managedProcess?.outcome
        let facts
        if (error instanceof ClaudeCodeFailure) {
          facts = { ...error.facts, outcome: processOutcome }
        } else if (processOutcome !== undefined && !receivedResult) {
          facts = { stage: 'process', category: 'process', outcome: processOutcome }
        } else {
          facts = { stage: 'query-run', category: 'unknown', outcome: processOutcome }
        }
        prependFailureDiagnostic(facts)
        throw error instanceof ClaudeCodeFailure ? error : new ClaudeCodeFailure(facts, thrown(error))
      }
    },
    collectOutput: () => [],
    collectDiagnostic: () => diagnostic,
    cancelled: () => controller.signal.aborted,
    onError: spec.onError,
    signal: request.signal,
    onAbort,
  })

  return subprocessRunHandle({
    id: SessionId(randomUUID()),
    result,
    signal: request.signal,
    onAbort,
    requestCancel,
    teardown: async () => {
      try {
        await disposeClaudeCodeChild(publishedQuery, publishedChild)
      } catch (error) {
        const failure = thrown(error)
        reportFailure(failure)
        throw failure
      }
    },
  })
}
