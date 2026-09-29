const QUEUE_PREVIEW_CHARS = 200

function previewOf(content) {
  const flat = content
    .map(block => (block.type === 'text' ? block.text : `[${block.type}]`))
    .join(' ').replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length > QUEUE_PREVIEW_CHARS ? `${chars.slice(0, QUEUE_PREVIEW_CHARS).join('')}…` : flat
}

function textOf(content) {
  if (!content.every(block => block.type === 'text')) return null
  return content.map(block => block.text).join('')
}

export class SessionQueueMirror {
  current = []

  snapshot() {
    return this.current
  }

  reset() {
    if (this.current.length === 0) return false
    this.current = []
    return true
  }

  replace(items) {
    this.current = items.map(item => ({
      id: item.id,
      messageId: item.message.id,
      placement: item.placement,
      content: item.message.content,
      preview: previewOf(item.message.content),
      text: textOf(item.message.content),
    }))
  }

  acceptDurable(event) {
    if (event.type !== 'user/message') return false
    const messageId = event.data.id
    const index = this.current.findIndex(item =>
      item.placement === 'steering' && item.messageId === messageId)
    if (index < 0) return false
    this.current = this.current.filter((_item, candidate) => candidate !== index)
    return true
  }
}
