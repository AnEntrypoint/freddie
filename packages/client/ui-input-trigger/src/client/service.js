import { Service } from '@freddie/cordis'
import { InputTriggerController } from './controller.js'

export class InputTriggerService extends Service {
  static inject = ['sessions']

  live = { sources: [], controllers: new Map() }

  constructor(ctx) {
    super(ctx, 'inputTriggers')
  }

  registerSource(src) {
    const { live } = this
    if (live.sources.some(s => s.trigger === src.trigger && s.name === src.name)) {
      throw new Error(`slash source "${src.trigger}${src.name}" is already registered`)
    }
    live.sources.push(src)
    for (const controller of live.controllers.values()) {
      try {
        controller.sourceAdded(src)
      } catch (error) {
        console.error(`[ui-input-trigger] source "${src.trigger}${src.name}" late-registration setup failed:`, error)
      }
    }
    return () => {
      const at = live.sources.indexOf(src)
      if (at < 0) return
      live.sources.splice(at, 1)
      for (const controller of live.controllers.values()) controller.sourceRemoved(src)
    }
  }

  sessionOf(actx) {
    const sessions = this.sessions()
    const id = sessions.scopeOf(actx)
    if (id === undefined) throw new Error('slash.sessionOf requires a session scope')
    const { live } = this
    const existing = live.controllers.get(id)
    if (existing !== undefined) return existing
    const controller = new InputTriggerController({
      actx,
      sessionId: id,
      roster: {
        sources: trigger => live.sources.filter(s => s.trigger === trigger).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        all: () => live.sources,
      },
    })
    live.controllers.set(id, controller)
    actx.effect(() => () => {
      controller.dispose()
      live.controllers.delete(id)
    }, 'slash: session controller')
    return controller
  }

  sessions() {
    const sessions = this.ctx.get('sessions')
    if (sessions === undefined) throw new Error('ui-input-trigger: sessions service unavailable')
    return sessions
  }
}
