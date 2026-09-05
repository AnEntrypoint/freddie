/**
 * Shared route, framing, timeout, assembly, and validation policy for
 * model-backed session-title providers.
 * @module @freddie/freddie-session-title-llm
 */

import z from '@freddie/schemastery'
import { createUserMessage, BlockAssembler, deepFreeze } from '@freddie/freddie-llm'
import { deadline, MAX_TIMER_DELAY_MS } from '@freddie/freddie-timeout'
import {
  normalizeSessionTitle,
  SessionTitleProviderId,
} from '@freddie/freddie-session-title'

/** Capability-owned timeout reason code for auxiliary title requests. */
export const SESSION_TITLE_TIMEOUT_CODE = 'SESSION_TITLE_TIMEOUT'

/** Shared Loader field schemas with no library defaults. */
export const SessionTitleLlmConfigFields = {
  targetWords: z.number().step(1).min(1).required(),
  targetCjkCharacters: z.number().step(1).min(1).required(),
  maxInputBytes: z.number().step(1).min(1).required(),
  maxOutputTokens: z.number().step(1).min(1).required(),
  timeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).required(),
  provider: z.string(),
  model: z.string(),
}

/** Shared Loader schema with no library defaults. */
export const SessionTitleLlmConfigSchema = z.object(SessionTitleLlmConfigFields)

/** Complete configuration key set for direct construction validation. */
const CONFIG_KEYS = new Set([
  'targetWords',
  'targetCjkCharacters',
  'maxInputBytes',
  'maxOutputTokens',
  'timeoutMs',
  'provider',
  'model',
])

/** Validate one positive integer limit. */
function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`session-title-llm: ${name} must be a positive integer`)
  }
}

/**
 * Validate and detach required model-provider configuration.
 * @param config - untrusted plugin configuration.
 * @returns immutable policy with optional route absence preserved.
 */
export function resolveSessionTitleLlmConfig(config) {
  const candidate = config
  if (candidate === null || typeof candidate !== 'object') {
    throw new Error('session-title-llm: configuration is required')
  }
  const value = candidate
  for (const key of Object.keys(value)) {
    if (!CONFIG_KEYS.has(key)) throw new Error(`session-title-llm: unknown config key "${key}"`)
  }
  assertPositiveInteger('targetWords', value.targetWords)
  assertPositiveInteger('targetCjkCharacters', value.targetCjkCharacters)
  assertPositiveInteger('maxInputBytes', value.maxInputBytes)
  assertPositiveInteger('maxOutputTokens', value.maxOutputTokens)
  assertPositiveInteger('timeoutMs', value.timeoutMs)
  if (value.timeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`session-title-llm: timeoutMs must not exceed ${MAX_TIMER_DELAY_MS}`)
  }
  const hasProvider = value.provider !== undefined
  const hasModel = value.model !== undefined
  if (hasProvider !== hasModel) {
    throw new Error('session-title-llm: provider and model must be supplied together')
  }
  if (hasProvider
    && (typeof value.provider !== 'string' || value.provider.length === 0
      || typeof value.model !== 'string' || value.model.length === 0)) {
    throw new Error('session-title-llm: provider and model overrides must be non-empty strings')
  }
  return deepFreeze({ ...value })
}

/**
 * Register one model-backed provider through the shared configuration and call policy.
 * @param ctx - context exposing the title and LLM services.
 * @param config - untrusted required deployment policy.
 * @param id - stable plugin id recorded with generated titles.
 * @param automatic - provider-owned automatic generation cadence.
 * @param selectMessages - exact source-message selection for one revision.
 */
export function registerSessionTitleLlmProvider(
  ctx,
  config,
  id,
  automatic,
  selectMessages,
) {
  const resolved = resolveSessionTitleLlmConfig(config)
  const titleProvider = SessionTitleProviderId(id)
  ctx.sessionTitle.register({
    id: titleProvider,
    automatic,
    async generate(request) {
      return generateSessionTitleWithLlm(ctx, resolved, request, selectMessages(request.messages), titleProvider)
    },
  })
}

/** Resolve the explicit pair or the exact route captured from `request/header`. */
function resolveRoute(config, request) {
  if (config.provider !== undefined && config.model !== undefined) {
    return { provider: config.provider, model: config.model }
  }
  if (request.route === undefined) {
    throw new Error('session-title-llm: no logged request route is available; configure provider and model together')
  }
  return request.route
}

/** Stable language-aware system instruction shared by both provider plugins. */
function systemPrompt(config) {
  return [
    'Create a concise title for an AI coding-assistant session from the supplied human messages.',
    'Return only the title on one line, **in plain text of natural language**, with no quotes, prefix, explanation, Markdown, XML, or terminal control codes. No code is allowed.',
    'Use the language of the messages.',
    `Aim for about ${config.targetWords} words in non-CJK languages or ${config.targetCjkCharacters} CJK characters.`,
  ].join('\n')
}

/** Frame exact messages as JSON so user text cannot break structural delimiters. */
function frameMessages(messages) {
  return `Generate the session title from this JSON array of human messages:\n${JSON.stringify(messages)}`
}

/** Translate terminal finish reasons into an auxiliary-call failure. */
function finishError(finish) {
  switch (finish.kind) {
    case 'stop':
      return undefined
    case 'error':
    case 'aborted': {
      const error = new Error(finish.failure.message)
      error.code = finish.failure.code
      return error
    }
    case 'max-tokens':
      return new Error('session-title-llm: title output reached maxOutputTokens')
    case 'tool-calls':
      return new Error('session-title-llm: title model unexpectedly requested a tool')
    default:
      return new Error(`session-title-llm: unsupported finish reason "${String(finish.kind)}"`)
  }
}

/**
 * Generate one title through the shared auxiliary LLM call.
 * @param ctx - context exposing the registered LLM service.
 * @param config - validated model-provider policy.
 * @param request - service-owned session, route, message snapshot, and cancellation.
 * @param selectedMessages - exact provider-selected subset to frame and attribute.
 * @param titleProvider - registered title-provider identity recorded with the request.
 * @returns normalized non-empty title, exact source seqs, and used model route.
 */
export async function generateSessionTitleWithLlm(
  ctx,
  config,
  request,
  selectedMessages,
  titleProvider,
) {
  request.signal.throwIfAborted()
  if (selectedMessages.length === 0) {
    throw new Error('session-title-llm: at least one source message is required')
  }
  const framedInput = frameMessages(selectedMessages)
  const inputBytes = Buffer.byteLength(framedInput, 'utf8')
  if (inputBytes > config.maxInputBytes) {
    throw new Error(`session-title-llm: input is ${inputBytes} bytes, exceeding maxInputBytes ${config.maxInputBytes}`)
  }
  const route = resolveRoute(config, request)
  const messages = [createUserMessage({
    content: [{ type: 'text', text: framedInput }],
    source: { kind: 'plugin', plugin: 'freddie-session-title-llm' },
  })]
  const system = systemPrompt(config)
  using callDeadline = deadline(request.signal, config.timeoutMs, SESSION_TITLE_TIMEOUT_CODE)
  const options = deepFreeze({
    provider: route.provider,
    model: route.model,
    messages,
    system,
    maxTokens: config.maxOutputTokens,
    sessionId: request.session.id,
    purpose: 'session-title',
    signal: callDeadline.signal,
  })
  request.session.append('session/title-llm-request', {
    titleProvider,
    messageSeqs: selectedMessages.map(message => message.seq),
    route,
    system,
    messages,
    maxTokens: config.maxOutputTokens,
  })
  callDeadline.signal.throwIfAborted()
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(options)) {
    callDeadline.signal.throwIfAborted()
    assembler.push(chunk)
  }
  callDeadline.signal.throwIfAborted()
  const terminalError = finishError(assembler.finish)
  if (terminalError !== undefined) throw terminalError
  const blocks = assembler.blocks()
  if (blocks.some(block => block.type === 'tool-call')) {
    throw new Error('session-title-llm: title output must contain text only')
  }
  const text = blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join(' ')
  const title = normalizeSessionTitle(text, Number.MAX_SAFE_INTEGER)
  if (title.length === 0) throw new Error('session-title-llm: title model produced no text')
  return {
    title,
    messageSeqs: selectedMessages.map(message => message.seq),
    model: route,
  }
}
