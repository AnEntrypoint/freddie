import { EventSourceParserStream } from 'eventsource-parser/stream'
import { LlmError } from '@freddie/freddie-llm'

export const DONE = '[DONE]'

export async function* parseSse(stream, onComment) {
  const events = stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream({ onComment }))
  for await (const { data } of events) {
    yield data
    if (data === DONE) return
  }
  throw new LlmError('SSE stream ended without [DONE]', 'STREAM_CLOSED')
}
