export class AssistantOutputFold {
  message
  partial = []

  push(event) {
    if (event.type === 'assistant/message') {
      const content = event.data.message.content
      if (content.length > 0) this.message = content
    } else if (event.type === 'assistant/chunk' && event.data.chunk.type === 'text-delta') {
      this.pushText(event.data.chunk.text)
    }
  }

  pushText(text) {
    if (text.length > 0) this.partial.push(text)
  }

  collect() {
    if (this.message !== undefined) return this.message
    const text = this.partial.join('')
    return text.length > 0 ? [{ type: 'text', text }] : undefined
  }
}

export function finalAssistantOutput(events) {
  const fold = new AssistantOutputFold()
  for (const event of events) fold.push(event)
  return fold.collect()
}
