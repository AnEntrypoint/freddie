import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'
import { detectTrigger } from '../core/detect.js'
import { MENU_CLOSED, menuReduce, seedGroups } from '../core/menu.js'

export class InputTriggerController {
  menu = createSnapshotStore(MENU_CLOSED)
  launcher = createSnapshotStore(null)
  lexicon = createSnapshotStore(new Map())

  #hit = null
  #fetch = null
  #disposed = false
  #lexiconOffs = new Map()

  constructor(deps) {
    this.deps = deps
    const projection = this.#project()
    for (const src of deps.roster.all()) {
      src.warm?.(projection)
      this.#watchLexicon(src, projection)
    }
    this.#refreshLexicon()
  }

  track(draft, caret, guard, draftRev) {
    if (this.#disposed) return
    const launched = this.launcher.getSnapshot() !== null
    this.#clearLauncher()
    const raw = detectTrigger(draft, caret, guard)
    if (raw === null) {
      this.#hit = null
      this.#stopFetch()
      this.#reduce({ type: 'close' })
      return
    }
    const hit = { ...raw, span: { ...raw.span, draftRev } }
    const prev = this.menu.getSnapshot()
    const same = !launched && prev.open && prev.hit !== null
      && prev.hit.trigger === hit.trigger && prev.hit.query === hit.query
      && prev.hit.quoted === hit.quoted
      && prev.hit.span.start === hit.span.start && prev.hit.span.end === hit.span.end
    this.#hit = hit
    if (same) return
    const roster = this.deps.roster.sources(hit.trigger)
    if (roster.length === 0) {
      this.#stopFetch()
      this.#reduce({ type: 'close' })
      return
    }
    if (launched || !prev.open || prev.hit === null || prev.hit.trigger !== hit.trigger) {
      this.menu.set(seedGroups(this.menu.getSnapshot(), roster))
    }
    this.#reduce({ type: 'hit', hit })
    this.#fetchCandidates(hit, roster)
  }

  toggleSource(source, hit) {
    if (this.#disposed) return
    if (this.launcher.getSnapshot() === source && this.menu.getSnapshot().open) {
      this.dismiss()
      return
    }
    const match = this.deps.roster.sources(hit.trigger).find(item => item.name === source)
    if (match === undefined) {
      this.dismiss()
      return
    }
    this.#stopFetch()
    this.#hit = hit
    this.launcher.set(source)
    this.menu.set(seedGroups(this.menu.getSnapshot(), [match]))
    this.#reduce({ type: 'hit', hit })
    this.#fetchCandidates(hit, [match])
  }

  pick(source, index) {
    const state = this.menu.getSnapshot()
    const hit = this.#hit
    if (this.#disposed || !state.open || hit === null) return
    const group = state.groups.find(g => g.source === source)
    const candidate = group !== undefined && group.status === 'ready' ? group.items[index] : undefined
    if (candidate === undefined) return
    const src = this.deps.roster.sources(hit.trigger).find(s => s.name === source)
    if (src === undefined) return
    const outcome = src.onPick({
      candidate,
      session: this.#project(),
      position: hit.position,
      via: 'menu',
      span: hit.span,
    })
    this.#stopFetch()
    this.#reduce({ type: 'close' })
    this.#execute(outcome, hit.span)
  }

  arbitrate(key, composing) {
    if (composing || this.#disposed) return 'pass'
    const state = this.menu.getSnapshot()
    if (!state.open) return 'pass'
    switch (key) {
      case 'up': {
        this.#reduce({ type: 'move', dir: -1 })
        return 'consumed'
      }
      case 'down': {
        this.#reduce({ type: 'move', dir: 1 })
        return 'consumed'
      }
      case 'escape': {
        this.#stopFetch()
        this.#reduce({ type: 'close' })
        return 'consumed'
      }
      case 'enter': {
        if (state.highlight === null) return 'pass'
        this.pick(state.highlight.source, state.highlight.index)
        return 'pick-highlighted'
      }
    }
  }

  onSpace() {
    const hit = this.#hit
    if (this.#disposed || hit === null || hit.position !== 'leading') return false
    const token = hit.trigger + hit.query
    const projection = this.#project()
    for (const src of this.deps.roster.sources(hit.trigger)) {
      if (src.matchSpace === undefined) continue
      const outcome = src.matchSpace(projection, token)
      if (outcome === undefined) continue
      if (outcome === 'handled') return true
      return this.#execute(outcome, hit.span)
    }
    return false
  }

  serializeReference(source, ref, signal) {
    const owner = this.deps.roster.all().find(s => s.name === source)
    if (owner?.codec === undefined) {
      return Promise.reject(new Error(`slash: no serializer for reference source "${source}"`))
    }
    return owner.codec.serialize(ref, signal)
  }

  async adjudicate(line, signal, envelope) {
    const projection = this.#project()
    for (const src of this.deps.roster.all()) {
      if (signal.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error('slash adjudication aborted')
      }
      if (src.matchEnter === undefined || !line.startsWith(src.trigger)) continue
      const outcome = await src.matchEnter(projection, line, signal, envelope)
      if (outcome !== undefined) return outcome
    }
    return undefined
  }

  sourceRemoved(source) {
    const state = this.menu.getSnapshot()
    if (state.open && state.hit !== null && state.hit.trigger === source.trigger) {
      this.#reduce({ type: 'source-failed', generation: state.generation, source: source.name })
    }
    this.#lexiconOffs.get(source)?.()
    this.#lexiconOffs.delete(source)
    this.#refreshLexicon()
  }

  sourceAdded(source) {
    const projection = this.#project()
    source.warm?.(projection)
    this.#watchLexicon(source, projection)
    this.#refreshLexicon()
  }

  dismiss() {
    if (this.#disposed) return
    this.#stopFetch()
    this.#reduce({ type: 'close' })
  }

  dispose() {
    this.#disposed = true
    this.#stopFetch()
    this.#reduce({ type: 'close' })
    this.#hit = null
    for (const off of this.#lexiconOffs.values()) off()
    this.#lexiconOffs.clear()
  }

  #project() {
    return { sessionId: this.deps.sessionId }
  }

  #execute(outcome, span) {
    const { actx } = this.deps
    if (outcome === undefined || outcome === 'handled') return false
    if ('claim' in outcome) {
      return actx.bail(actx, 'slash/input-begin-command', { claim: outcome.claim, span }) === true
    }
    if ('text' in outcome) {
      return actx.bail(actx, 'slash/input-insert-text', {
        text: outcome.text,
        span,
        ...outcome.continue === true ? { continue: true } : {},
      }) === true
    }
    return actx.bail(actx, 'slash/input-insert-reference', { reference: outcome.insert, span }) === true
  }

  #refreshLexicon() {
    const projection = this.#project()
    const rolls = new Map()
    for (const src of this.deps.roster.all()) {
      if (src.lexicon === undefined) continue
      let names
      try {
        names = src.lexicon(projection)
      } catch (error) {
        console.error(`[ui-input-trigger] source "${src.name}" lexicon failed:`, error)
        continue
      }
      if (names === undefined) continue
      const prev = rolls.get(src.trigger)
      rolls.set(src.trigger, prev === undefined ? names : [...prev, ...names])
    }
    this.lexicon.set(rolls)
  }

  #watchLexicon(source, projection) {
    if (source.lexicon === undefined || source.subscribeLexicon === undefined) return
    this.#lexiconOffs.set(source, source.subscribeLexicon(projection, () => { this.#refreshLexicon() }))
  }

  #fetchCandidates(hit, roster) {
    this.#stopFetch()
    const controller = new AbortController()
    this.#fetch = controller
    const generation = this.menu.getSnapshot().generation
    const projection = this.#project()
    for (const source of roster) {
      void source
        .candidates(projection, {
          query: hit.query,
          quoted: hit.quoted,
          position: hit.position,
          signal: controller.signal,
        })
        .then(
          (items) => {
            if (controller.signal.aborted) return
            this.#reduce({ type: 'source-settled', generation, source: source.name, items })
          },
          (error) => {
            if (controller.signal.aborted) return
            console.error(`[ui-input-trigger] source "${source.name}" candidates failed:`, error)
            this.#reduce({ type: 'source-failed', generation, source: source.name })
          },
        )
    }
  }

  #stopFetch() {
    this.#fetch?.abort()
    this.#fetch = null
  }

  #clearLauncher() {
    if (this.launcher.getSnapshot() !== null) this.launcher.set(null)
  }

  #reduce(ev) {
    const cur = this.menu.getSnapshot()
    const next = menuReduce(cur, ev)
    if (next !== cur) this.menu.set(next)
    if (!next.open) this.#clearLauncher()
  }
}
