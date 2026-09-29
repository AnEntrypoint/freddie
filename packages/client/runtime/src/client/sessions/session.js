
import { transportError } from '@freddie/freddie-host-apiproxy/api'
import { ConversationNodeAssembler } from './conversation-assembler.js'
import { EMPTY_CHAT_SNAPSHOT } from './conversation.js'
import { PendingWait } from './pending.js'
import { Notifier } from './notifier.js'
import { ProjectionValueStore } from './projection-store.js'
import { resolvedClientTimeZone } from '../time-zone.js'
import { SessionQueueMirror } from './queue-mirror.js'

export const PAGE_MESSAGES = 50


export class Session {
  events = []
  views = []
  baseSeq = 0
  hasMore = false
  openState = 'cold'
  openError = null
  openPromise = null
  openGeneration = 0
  loadingOlder = false
  pending = new Map()
  pendingRev = 0
  pendingCache = null
  queueMirror = new SessionQueueMirror()
  running = false
  address
  parentAvailable = false
  promptAttempted = false
  firstPromptPendingTurn = false
  blankBit = true
  removed = false
  promptError = null
  lastAgentError = null
  liveBuffer = []
  stitching = false
  gapRepairRetry = null
  gapRepairDelay = 250
  subscribedLastSeq = null

  projections

  snapshotCache
  notifier
  actx

  constructor(
    sessionId,
    api,
    remote,
    options = {},
  ) {
    this.sessionId = sessionId
    this.api = api
    this.remote = remote
    this.options = options
    this.projections = options.projections ?? new ProjectionValueStore()
    this.address = options.address
    this.parentAvailable = options.parentAvailable ?? false
    this.conversation = options.conversation === undefined
      ? new ConversationNodeAssembler(
        { entries: () => [], fallbackEntry: () => undefined },
        { entries: () => [] },
      )
      : new ConversationNodeAssembler(options.conversation.events, options.conversation.views)
    this.notifier = new Notifier(() => {
      this.conversation.flush()
      this.snapshotCache = this.buildSnapshot()
    })
    this.snapshotCache = this.buildSnapshot()
  }

  bindScope(actx) {
    if (this.actx !== undefined) throw new Error(`session ${this.sessionId} already has a bound scope`)
    this.actx = actx
  }

  unbindScope() {
    this.actx = undefined
  }


  async prompt(
    content,
    mode,
    signal,
  ) {
    this.promptError = null
    this.lastAgentError = null
    this.promptAttempted = true
    if (this.blankBit) this.firstPromptPendingTurn = true
    this.notifier.markDirty()
    let result
    try {
      if (this.address === undefined) {
        result = (await this.api.sessions.prompt({
          sessionId: this.sessionId,
          mode,
          content,
          clientTimeZone: resolvedClientTimeZone(),
        }, signal)).result
      } else if (this.address.mode === 'one-shot') {
        result = {
          ok: false,
          error: {
            code: 'subagent-not-resumable',
            message: 'one-shot subagent conversations are read-only',
            details: { childSessionId: this.address.childSessionId },
          },
        }
      } else {
        if (content.some(part => part.type === 'image')) {
          result = {
            ok: false,
            error: {
              code: 'attachment-error',
              message: 'Image input is unavailable for subagent continuations.',
              details: { reason: 'SUBAGENT_IMAGE_UNSUPPORTED' },
            },
          }
        } else {
          const routed = (await this.api.subagents.prompt({
            ...this.address,
            content: content.flatMap(part => part.type === 'text'
              ? [{ type: 'text', text: part.text }]
              : []),
            clientTimeZone: resolvedClientTimeZone(),
          }, signal)).result
          result = routed.ok ? { ok: true, value: { accepted: true } } : routed
        }
      }
    } catch (error) {
      result = transportError(error)
    }
    if (!result.ok) {
      this.promptError = { op: 'send', error: result.error }
      this.notifier.markDirty()
      return result
    }
    if (this.blankBit) {
      this.blankBit = false
      this.options.onEngaged?.(this)
      this.notifier.markDirty()
    }
    return result
  }

  async readAttachment(
    attachmentId,
  ) {
    try {
      const result = (await this.api.sessions.attachment({
        sessionId: this.sessionId,
        attachmentId,
      })).result
      if (!result.ok) return result
      const binary = atob(result.value.data)
      const data = Uint8Array.from(binary, char => char.charCodeAt(0))
      return { ok: true, value: { attachment: result.value.attachment, data } }
    } catch (error) {
      return transportError(error)
    }
  }

  async updateQueue(itemId, action) {
    try {
      return (await this.api.sessions.updateQueue({ sessionId: this.sessionId, itemId, action })).result
    } catch (error) {
      return transportError(error)
    }
  }

  async cancel() {
    const address = this.address
    if (address !== undefined && address.mode === 'one-shot') {
      const result = {
        ok: false,
        error: {
          code: 'subagent-delivery-unavailable',
          message: 'subagent activation cancellation is unavailable',
          details: { childSessionId: address.childSessionId },
        },
      }
      this.promptError = { op: 'stop', error: result.error }
      this.notifier.markDirty()
      return result
    }
    let result
    try {
      result = address !== undefined
        ? (await this.api.subagents.interrupt(address)).result
        : (await this.api.sessions.cancel({ sessionId: this.sessionId, confirm: true })).result
    } catch (error) {
      result = transportError(error)
    }
    if (!result.ok) {
      this.promptError = { op: 'stop', error: result.error }
      this.notifier.markDirty()
    }
    return result
  }

  async rename(title) {
    try {
      const { result } = await this.api.sessions.rename({ sessionId: this.sessionId, title })
      if (result.ok) this.projections.apply('title', result.value.title, result.value.seq)
      return result
    } catch (error) {
      return transportError(error)
    }
  }

  async command(line) {
    const result = await this.remote.commands.execute(this.sessionId, line, [])
    if (!result.ok) return result
    return { ok: true, value: { matched: result.value !== undefined } }
  }

  open() {
    if (this.openState === 'open') return Promise.resolve()
    if (this.openPromise !== null) return this.openPromise
    const promise = this.doOpen(this.openGeneration).finally(() => {
      if (this.openPromise === promise) this.openPromise = null
    })
    this.openPromise = promise
    return promise
  }

  async loadOlder() {
    if (this.openState !== 'open' || !this.hasMore || this.loadingOlder) return
    this.loadingOlder = true
    this.notifier.markDirty()
    try {
      const { result } = await this.history({ beforeSeq: this.baseSeq, maxMessages: PAGE_MESSAGES })
      if (!result.ok) return
      const older = result.value.events
      if (older.length === 0) {
        this.hasMore = result.value.hasMore
        this.conversation.prepend([], this.hasMore)
        return
      }
      const tail = older[older.length - 1]
      if (tail === undefined || tail.event.seq + 1 !== this.baseSeq) {
        console.error(`[web-runtime] history page discontinuous: tail seq ${tail?.event.seq} vs baseSeq ${this.baseSeq}`)
        this.hasMore = false
        this.conversation.prepend([], false)
        return
      }
      this.events = [...older.map(e => e.event), ...this.events]
      this.views = [...older.map(e => e.view), ...this.views]
      this.baseSeq = older[0]?.event.seq ?? this.baseSeq
      this.hasMore = result.value.hasMore
      this.conversation.prepend(older.map(conversationInput), this.hasMore)
    } catch (error) {
      console.error('[web-runtime] loadOlder failed:', error)
    } finally {
      this.loadingOlder = false
      this.notifier.markDirty()
    }
  }

  async resync() {
    if (this.openState === 'cold') return
    this.openGeneration++
    this.clearGapRepairRetry()
    this.openPromise = null
    this.openState = 'cold'
    this.openError = null
    this.events = []
    this.views = []
    this.baseSeq = 0
    this.subscribedLastSeq = null
    this.liveBuffer = []
    this.notifier.markDirty()
    const generation = this.openGeneration
    await this.open()
    if (generation !== this.openGeneration) return
    if (this.openState === 'open' && !this.running) {
      const { result } = await this.history({ maxMessages: PAGE_MESSAGES })
      if (generation !== this.openGeneration) return
      if (result.ok) this.installWindow(result.value.events, result.value.hasMore, result.value.projections)
    }
  }


  subscribe(listener) {
    return this.notifier.subscribe(listener)
  }

  getSnapshot() {
    this.notifier.ensureFresh()
    return this.snapshotCache
  }


  handleMuxEnvelope(rpcId, frame) {
    switch (frame.type) {
      case 'session/event': {
        this.acceptLiveEvent(frame.event, frame.view)
        return
      }
      case 'session/queue': {
        this.queueMirror.replace(frame.items)
        this.notifier.markDirty()
        return
      }
      case 'session/subscribed': {
        this.subscribedLastSeq = frame.lastSeq
        const pendingReset = this.pending.size > 0
        if (pendingReset) {
          this.pending.clear()
          this.pendingRev++
        }
        if (pendingReset || this.queueMirror.reset()) this.notifier.markDirty()
        return
      }
      case 'approval/requested': {
        const { type: _type, sessionId: _sid, ...payload } = frame
        this.mint(new PendingWait('approval', rpcId, this.sessionId, payload, m => this.api.respond(m)))
        this.notifier.markDirty()
        return
      }
      case 'approval/resolved': {
        for (const item of this.pending.values()) {
          if (item.kind === 'approval' && item.payload.approvalId === frame.approvalId) this.settle(item)
        }
        this.notifier.markDirty()
        return
      }
      case 'question/requested': {
        const { type: _type, sessionId: _sid, ...payload } = frame
        this.mint(new PendingWait('question', rpcId, this.sessionId, payload, m => this.api.respond(m)))
        this.notifier.markDirty()
        return
      }
      case 'question/resolved': {
        const item = this.pending.get(`q:${frame.questionRpcId}`)
        if (item !== undefined) this.settle(item)
        this.notifier.markDirty()
        return
      }
      default:
        return
    }
  }

  handleRunning(running) {
    if (running && this.blankBit) {
      this.blankBit = false
      this.notifier.markDirty()
    }
    if (running) this.firstPromptPendingTurn = false
    if (this.running === running) return
    this.running = running
    this.notifier.markDirty()
  }

  configureSubagent(address, parentAvailable = false) {
    const same = this.address?.parentSessionId === address?.parentSessionId
      && this.address?.childSessionId === address?.childSessionId
      && this.address?.mode === address?.mode
    this.address = address
    this.parentAvailable = parentAvailable
    if (!same && this.openState !== 'cold') void this.resync()
    else this.notifier.markDirty()
  }

  handleSubagentParentAvailable(available) {
    if (this.parentAvailable === available) return
    this.parentAvailable = available
    this.notifier.markDirty()
  }

  handleBlank(blank) {
    if (blank === this.blankBit) return
    if (blank && (this.promptAttempted || this.running)) return
    this.blankBit = blank
    this.notifier.markDirty()
  }

  handleRemoved() {
    this.removed = true
    this.clearGapRepairRetry()
    this.notifier.markDirty()
  }

  handleAgentError(message) {
    this.lastAgentError = message
    this.notifier.markDirty()
  }

  dispose() {}

  rebuildConversationRegistry() {
    this.scheduleConversation(this.conversation.rebuildRegistry())
  }


  mint(wait) {
    this.pending.set(wait.key, wait)
    this.pendingRev++
  }

  settle(wait) {
    wait.markSettled()
    this.pending.delete(wait.key)
    this.pendingRev++
  }

  async doOpen(generation) {
    this.openState = 'loading'
    this.openError = null
    this.notifier.markDirty()
    try {
      let { result } = await this.history({ maxMessages: PAGE_MESSAGES })
      if (generation !== this.openGeneration) return
      if (!result.ok) {
        this.openState = 'error'
        this.openError = result.error
        return
      }
      this.installWindow(result.value.events, result.value.hasMore, result.value.projections)
      const tailSeq = this.windowTailSeq()
      if (this.subscribedLastSeq !== null && tailSeq !== null && this.subscribedLastSeq > tailSeq) {
        result = (await this.history({ maxMessages: PAGE_MESSAGES })).result
        if (generation !== this.openGeneration) return
        if (result.ok) this.installWindow(result.value.events, result.value.hasMore, result.value.projections)
      }
      this.openState = 'open'
    } catch (error) {
      if (generation !== this.openGeneration) return
      this.openState = 'error'
      const folded = transportError(error)
      this.openError = folded.ok ? null : folded.error
    } finally {
      if (generation === this.openGeneration) this.notifier.markDirty()
    }
  }

  installWindow(entries, hasMore, projections) {
    this.events = entries.map(e => e.event)
    this.views = entries.map(e => e.view)
    this.baseSeq = this.events[0]?.seq ?? 0
    this.hasMore = hasMore
    if (this.events.some(event => event.type === 'turn/start')) this.firstPromptPendingTurn = false
    this.conversation.replaceWindow(entries.map(conversationInput), hasMore)
    if (projections !== undefined) this.projections.seed(projections)
    const buffered = this.liveBuffer
    this.liveBuffer = []
    for (const item of buffered) this.appendLive(item.event, item.view)
    this.gapRepairDelay = 250
    this.notifier.markDirty()
  }

  appendLive(event, view) {
    const tailSeq = this.windowTailSeq()
    if (tailSeq !== null && event.seq <= tailSeq) return 'none'
    this.events.push(event)
    this.views.push(view)
    if (event.type === 'turn/start') this.firstPromptPendingTurn = false
    const queueChanged = this.queueMirror.acceptDurable(event)
    const publication = this.conversation.append({ event, view })
    return queueChanged ? 'immediate' : publication
  }

  acceptLiveEvent(event, view) {
    if (this.openState === 'loading' || this.stitching) {
      this.liveBuffer.push({ event, view })
      return
    }
    if (this.openState !== 'open') return
    const tailSeq = this.windowTailSeq()
    if (tailSeq !== null && event.seq > tailSeq + 1) {
      this.liveBuffer.push({ event, view })
      void this.repairGap()
      return
    }
    this.scheduleConversation(this.appendLive(event, view))
  }

  scheduleConversation(publication) {
    if (publication === 'immediate') this.notifier.markDirty()
    else if (publication === 'animation-frame') this.notifier.markFrameDirty()
  }

  async repairGap() {
    if (this.stitching) return
    this.clearGapRepairRetry(false)
    this.stitching = true
    const generation = this.openGeneration
    try {
      const { result } = await this.history({ maxMessages: PAGE_MESSAGES })
      if (result.ok && generation === this.openGeneration && this.openState === 'open') {
        this.installWindow(result.value.events, result.value.hasMore, result.value.projections)
      }
    } catch (error) {
      console.error('[web-runtime] gap repair failed:', error)
    } finally {
      this.stitching = false
      if (generation === this.openGeneration && this.openState === 'open' && !this.removed && this.liveBuffer.length > 0) {
        this.scheduleGapRepair()
      }
    }
  }

  scheduleGapRepair() {
    if (this.gapRepairRetry !== null) return
    const delay = this.gapRepairDelay
    this.gapRepairDelay = Math.min(this.gapRepairDelay * 2, 10_000)
    this.gapRepairRetry = setTimeout(() => {
      this.gapRepairRetry = null
      void this.repairGap()
    }, delay)
    this.notifier.markDirty()
  }

  clearGapRepairRetry(resetDelay = true) {
    if (this.gapRepairRetry !== null) clearTimeout(this.gapRepairRetry)
    this.gapRepairRetry = null
    if (resetDelay) this.gapRepairDelay = 250
  }

  windowTailSeq() {
    const tail = this.events[this.events.length - 1]
    return tail === undefined ? null : tail.seq
  }

  buildSnapshot() {
    if (this.pendingCache === null || this.pendingCache.rev !== this.pendingRev) {
      this.pendingCache = { rev: this.pendingRev, value: [...this.pending.values()] }
    }
    const chat = this.conversation.snapshot('chat') ?? EMPTY_CHAT_SNAPSHOT
    const legacy = chat.legacy
    return {
      sessionId: this.sessionId,
      views: this.conversation,
      chat,
      nodes: legacy.nodes,
      turnTimings: legacy.turnTimings,
      turnEnds: legacy.turnEnds,
      partial: legacy.partial,
      runningCalls: legacy.runningCalls,
      pending: this.pendingCache.value,
      queue: this.queueMirror.snapshot(),
      running: this.running,
      subagent: this.address === undefined
        ? null
        : { address: this.address, parentAvailable: this.parentAvailable },
      composerPhase: derivePhase(
        hasVisibleConversationContent(chat)
          || (!this.blankBit && !this.firstPromptPendingTurn)
          || this.running
          || this.pendingCache.value.length > 0,
        this.promptAttempted,
      ),
      removed: this.removed,
      openState: this.openState,
      openError: this.openError,
      hasMore: this.hasMore,
      loadingOlder: this.loadingOlder,
      promptError: this.promptError,
      blank: this.blankBit,
      lastAgentError: this.lastAgentError,
      gapRepair: { bufferedEvents: this.liveBuffer.length, retrying: this.gapRepairRetry !== null },
    }
  }

  history(payload) {
    return this.address === undefined
      ? this.api.sessions.history({ sessionId: this.sessionId, ...payload })
      : this.api.subagents.history({ ...this.address, ...payload })
  }
}

function conversationInput(entry) {
  return { event: entry.event, view: entry.view }
}

function hasVisibleConversationContent(chat) {
  return chat.order.some(key => chat.nodes.get(key)?.kind !== 'command')
}

function derivePhase(hasContent, promptAttempted) {
  if (hasContent) return 'active'
  return promptAttempted ? 'engaging' : 'blank'
}
