import fs from 'node:fs'

const j = JSON.parse(fs.readFileSync('.gm/rpc-session.history.json', 'utf8'))
// This file was overwritten by the error-session history call (same filename).
const evs = j.result.value.events.map((x) => x.event)
console.log('n', evs.length, 'hasMore', j.result.value.hasMore)
const types = {}
for (const e of evs) types[e.type] = (types[e.type] || 0) + 1
console.log('types', types)
for (const e of evs) {
  if (e.type === 'session/title' || e.type === 'session/title-llm-request' || e.type === 'user/message' || e.type === 'assistant/message') {
    const extra = e.type === 'session/title'
      ? JSON.stringify(e.data)
      : e.type === 'user/message'
        ? JSON.stringify(e.data?.content ?? e.data).slice(0, 400)
        : e.type === 'assistant/message'
          ? JSON.stringify(e.data).slice(0, 400)
          : JSON.stringify({ provider: e.data?.titleProvider, route: e.data?.route }).slice(0, 300)
    console.log(e.seq, e.type, extra)
  }
}
