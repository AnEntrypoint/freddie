const PAGE_MESSAGES = 100
const MAX_PAGES = 8

function textOfContent(content) {
  const parts = []
  for (const block of content) {
    if (block.type === 'text') parts.push(block.text)
  }
  return parts.join('')
}

function promptOf(event) {
  if (event.type !== 'user/message' || event.data.source.kind !== 'user') return undefined
  const text = textOfContent(event.data.content)
  if (text.trim() === '') return undefined
  return { seq: event.seq, time: event.time, text }
}

export async function loadUserPrompts(api, sessionId) {
  const prompts = []
  let beforeSeq
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { result } = await api.sessions.history({
      sessionId,
      maxMessages: PAGE_MESSAGES,
      ...beforeSeq === undefined ? {} : { beforeSeq },
    })
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    const { events, hasMore } = result.value
    for (const entry of events) {
      const prompt = promptOf(entry.event)
      if (prompt !== undefined) prompts.push(prompt)
    }
    if (!hasMore || events.length === 0) break
    beforeSeq = events[0].event.seq
  }
  return prompts.sort((a, b) => a.time - b.time || a.seq - b.seq)
}
