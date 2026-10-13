import { queueReadFaceOf } from '../queue/store.js'
import { SessionInputShell } from './facade.js'

export class InputHub {
  constructor(sessions, rootCtx, t) {
    this.sessionService = sessions
    this.rootCtx = rootCtx
    this.t = t
    this.shells = new Map()
  }

  for(actx) {
    const sessions = this.sessions()
    const id = sessions.scopeOf(actx)
    if (id === undefined) throw new Error('conversation.input.for requires a session scope')
    return this.shell(id)
  }

  shellFor(binding) {
    const existing = this.shells.get(binding.sessionId)
    if (existing !== undefined) return existing
    const { sessionId: id, session, ctx: actx } = binding
    const shell = new SessionInputShell({
      actx,
      inputTriggers: () => this.controller(actx),
      popup: () => this.popup(actx),
      queue: queueReadFaceOf(session),
      defaultSink: (text, imageIds, mode, signal) => this.sink(session, text, imageIds, mode, signal),
      promptHistory: () => this.workspacePrompts(id),
      steerQueue: () => { void this.steerQueue(session, shell) },
      commandImages: {
        serialize: ids => this.conversation().serializeDraftImages(ids),
        release: (ids) => {
          const conversation = this.rootCtx.get('conversation')
          for (const imageId of ids) conversation?.releaseDraftImage(imageId)
        },
        unsupportedNotice: token => this.t('command.imagesUnsupported', {
          command: token.trim().replace(/^\//u, ''),
        }),
      },
    })
    this.shells.set(id, shell)
    let disposeOwner
    disposeOwner = this.rootCtx.effect(() => actx.effect(() => {
      const offs = [
        actx.on('slash/input-begin-command', req =>
          shell.beginCommand(req.claim, req.span) ? true : undefined),
        actx.on('slash/input-insert-reference', req =>
          shell.insertReference(req.reference, req.span) ? true : undefined),
        actx.on('slash/input-consume-token', req =>
          shell.consumeToken(req.guard) ? true : undefined),
        actx.on('slash/input-insert-text', req =>
          shell.insertText(req.text, req.span, req.continue === true) ? true : undefined),
      ]
      return () => {
        disposeOwner?.()
        for (const off of offs) off()
        const drafts = shell.snapshot.imageIds
        shell.dispose()
        this.shells.delete(id)
        const conversation = this.rootCtx.get('conversation')
        for (const imageId of drafts) conversation?.releaseDraftImage(imageId)
      }
    }, 'conversation.input: session shell'), 'conversation.input: owner session shell')
    return shell
  }

  shell(id) {
    const existing = this.shells.get(id)
    if (existing !== undefined) return existing
    const binding = this.sessions().binding(id)
    if (binding === undefined) throw new Error(`conversation.input: session "${id}" resolved no binding`)
    return this.shellFor(binding)
  }

  keyboard(id) {
    return this.shell(id)
  }

  inputTriggers(id) {
    const actx = this.sessions().scope(id)
    return actx === undefined ? undefined : this.controller(actx)
  }

  sink(session, text, imageIds, mode, signal) {
    if (text === '' && imageIds.length === 0) return Promise.resolve({ kind: 'success' })
    return this.conversation().sendSession(session, text, imageIds, mode, signal)
  }

  async steerQueue(session, shell) {
    const queued = session.getSnapshot().queue.filter(item => item.placement === 'queued')
    if (queued.length === 0) return
    for (const item of queued) {
      const result = await session.updateQueue(item.id, { kind: 'steer' })
      if (result.ok) continue
      if (result.error.code === 'steer-unavailable' || result.error.code === 'queue-item-not-found') return
      shell.notify('error', this.t('queue.steerFailed'))
      return
    }
  }

  async workspacePrompts(sessionId) {
    const sessions = this.sessions()
    const workspaces = this.rootCtx.get('workspaces')
    const workspace = workspaces?.list.getSnapshot().items.find(item => item.sessionIds.includes(sessionId))
    const summaries = sessions.list.getSnapshot().byId
    const ids = (workspace?.sessionIds ?? [sessionId]).filter(id => summaries[id]?.parentId === undefined)
    const settled = await Promise.allSettled(ids.map(id => sessions.userPrompts(id)))
    return settled
      .flatMap((outcome, order) => outcome.status === 'fulfilled'
        ? outcome.value.map(prompt => ({ ...prompt, order }))
        : [])
      .sort((a, b) => a.time - b.time || a.order - b.order || a.seq - b.seq)
      .map(prompt => prompt.text)
  }

  controller(actx) {
    const inputTriggers = this.rootCtx.get('inputTriggers')
    return inputTriggers?.sessionOf(actx)
  }

  popup(actx) {
    const command = this.rootCtx.get('commandUi')
    return command?.popupFor(actx)
  }

  sessions() {
    return this.sessionService
  }

  conversation() {
    const conversation = this.rootCtx.get('conversation')
    if (conversation === undefined) throw new Error('conversation.input: conversation service unavailable')
    return conversation
  }
}
