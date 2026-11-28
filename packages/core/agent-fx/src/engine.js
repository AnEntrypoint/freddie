import { LlmError } from '@freddie/freddie-llm'
import { MessageRecorder, FINISH_KINDS } from './recorder.js'
import { toFxTools } from './tools.js'

const textOf = message => message.content.filter(block => block.type === 'text').map(block => block.text).join('\n\n')
const isPlainUser = message => message.role === 'user' && message.content.every(block => block.type !== 'tool-result')

export function splitPrompt(messages) {
  let cut = messages.length
  while (cut > 0 && isPlainUser(messages[cut - 1])) cut--
  const prompt = messages.slice(cut)
  if (prompt.length === 0) throw new Error('fx engine: the conversation does not end in a user message, so there is nothing to prompt with')
  return { context: messages.slice(0, cut), input: prompt.map(textOf).join('\n\n') }
}

export class FxEngine {
  constructor({ createAgent, providerFor }) {
    this.createAgent = createAgent
    this.providerFor = providerFor
  }

  async step({ request, turn, step, session, signal, runToolCall }) {
    const recorder = new MessageRecorder(session, turn, step, { provider: request.provider, model: request.model })
    const stop = new AbortController()
    const forward = () => stop.abort(signal.reason)
    signal.addEventListener('abort', forward, { once: true })
    let concluded = false
    const tools = toFxTools(request.tools ?? [], async (name, input, context) => {
      recorder.flush(FINISH_KINDS.toolCalls)
      const call = recorder.claim(context?.executionId, name)
      const outcome = await runToolCall(call, signal)
      if (outcome.concluded) {
        concluded = true
        stop.abort()
      }
      return { content: outcome.content, isError: outcome.isError }
    })
    const agent = this.createAgent({
      instructions: request.system,
      tools,
      nativeTools: false,
      model: request.model,
      ...this.providerFor === undefined ? {} : { customProvider: this.providerFor(request.provider) },
    })
    const { context, input } = splitPrompt(request.messages)
    const turnHandle = agent.session(request.sessionId, { context, instructions: request.system }).prompt(input, { signal: stop.signal })
    try {
      for await (const event of turnHandle) this.handle(recorder, event)
      const result = await turnHandle.result
      if (result.stopReason === 'error') throw new LlmError(result.error?.message ?? 'fx agent turn failed', 'UNKNOWN', { message: result.error?.message ?? 'fx agent turn failed', code: 'UNKNOWN' })
      recorder.flush(result.stopReason === 'max_output_tokens' ? FINISH_KINDS.maxTokens : FINISH_KINDS.stop)
      if (result.stopReason === 'max_output_tokens') return { kind: 'max-tokens' }
      return { kind: 'completed' }
    } catch (error) {
      if (concluded && stop.signal.aborted && !signal.aborted) {
        recorder.flush(FINISH_KINDS.stop)
        return { kind: 'completed' }
      }
      throw error
    } finally {
      signal.removeEventListener('abort', forward)
    }
  }

  handle(recorder, event) {
    switch (event.type) {
      case 'text_delta': return recorder.text('text', event.text)
      case 'reasoning_delta': return recorder.text('reasoning', event.text)
      case 'tool_start': return recorder.toolCall(event.id, event.name, event.input)
      default: return undefined
    }
  }
}
