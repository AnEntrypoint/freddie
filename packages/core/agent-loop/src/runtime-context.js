import { createUserMessage } from '@freddie/freddie-llm'
import { isReplacementSurfaceEvent } from '@freddie/freddie-session'

const SOURCE = '@freddie/freddie-system-prompt'
const CLEARED = 'Current runtime context: none. Earlier runtime-context snapshots no longer apply.'

function isOwned(message) {
  return message.source.kind === 'plugin' && message.source.plugin === SOURCE
}

function textOf(message) {
  const [block] = message.content
  return message.content.length === 1 && block?.type === 'text' ? block.text : undefined
}

export class RuntimeContextProjection {
  retained

  constructor(ctx, session) {
    const surface = new Set(session.surface.nodes)
    for (let index = session.events.length - 1; index >= 0; index -= 1) {
      const event = session.events[index]
      if (event?.type !== 'user/message' || !isOwned(event.data)) continue
      this.retained ??= null
      if (surface.has(event.seq)) {
        this.retained = { seq: event.seq, text: textOf(event.data) }
        break
      }
    }

    ctx.on('session/event', (subject, event) => {
      if (subject !== session) return
      if (event.type === 'user/message' && isOwned(event.data)) {
        this.retained = { seq: event.seq, text: textOf(event.data) }
      } else if (this.retained
        && isReplacementSurfaceEvent(event)
        && event.sourceEventSeqs?.includes(this.retained.seq) === true) {
        this.retained = null
      }
    })
  }

  project(current, sections) {
    if (this.retained === undefined && current.length === 0) return
    const snapshot = current.length === 0 ? CLEARED : current
    if (this.retained?.text === snapshot) return
    return createUserMessage({
      content: [{ type: 'text', text: snapshot }],
      source: sections.length === 0
        ? { kind: 'plugin', plugin: SOURCE }
        : { kind: 'plugin', plugin: SOURCE, form: 'snapshot', sections },
    })
  }
}
