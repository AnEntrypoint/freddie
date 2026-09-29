import { Service } from '@freddie/cordis'
import { CommandDirectory } from './directory.js'
import { PopupSelectController } from './popup.js'

function submittedCommandName(line) {
  const trimmed = line.trim()
  const separator = trimmed.search(/\s/u)
  return (separator === -1 ? trimmed : trimmed.slice(0, separator)).slice(1)
}

function boundaryBonus(name, index) {
  return index === 0 || name.charAt(index - 1) === '-' || name.charAt(index - 1) === '_' ? 8 : 0
}

function fuzzyScore(name, query) {
  if (query === '') return 0
  if (query.length > name.length) return undefined
  const noMatch = Number.NEGATIVE_INFINITY
  let previous = Array(name.length).fill(noMatch)
  for (let index = 0; index < name.length; index++) {
    if (name.charAt(index) === query.charAt(0)) previous[index] = 1 + boundaryBonus(name, index) - index
  }
  for (let queryIndex = 1; queryIndex < query.length; queryIndex++) {
    const current = Array(name.length).fill(noMatch)
    let bestGapped = noMatch
    for (let index = 0; index < name.length; index++) {
      const gappedIndex = index - 2
      if (gappedIndex >= 0) {
        const prior = previous[gappedIndex] ?? noMatch
        if (prior !== noMatch) bestGapped = Math.max(bestGapped, prior + gappedIndex)
      }
      if (name.charAt(index) !== query.charAt(queryIndex)) continue
      const bonus = 1 + boundaryBonus(name, index)
      const adjacent = index > 0 ? previous[index - 1] ?? noMatch : noMatch
      if (adjacent !== noMatch) current[index] = adjacent + bonus + 4
      if (bestGapped !== noMatch) current[index] = Math.max(current[index] ?? noMatch, bestGapped + bonus + 1 - index)
    }
    previous = current
  }
  let best = noMatch
  for (const score of previous) best = Math.max(best, score)
  return best === noMatch ? undefined : best
}

function fuzzyCandidates(candidates, rawQuery) {
  const query = rawQuery.toLowerCase()
  if (query === '') return candidates
  const ranked = []
  candidates.forEach((candidate, index) => {
    const name = candidate.name.toLowerCase()
    const score = fuzzyScore(name, query)
    if (score !== undefined) ranked.push({ candidate, index, prefix: name.startsWith(query), score })
  })
  ranked.sort((left, right) =>
    Number(right.prefix) - Number(left.prefix) || right.score - left.score || left.index - right.index)
  return ranked.map(match => match.candidate)
}

export class CommandUiRuntime extends Service {
  static inject = ['inputTriggers', 'sessions', 'remote', 'remote.commands']

  live = { contributions: new Map(), decorations: new Map(), popups: new Map() }

  constructor(ctx) {
    super(ctx, 'commandUi')
    const locale = ctx.get('locale')
    if (locale === undefined) throw new Error('ui-commands: locale service unavailable')
    this.t = locale.bind('command')
    this.directory = new CommandDirectory(async (sessionId) => {
      if (this.sessions().subagentAddress(sessionId) !== undefined) return []
      const result = await ctx.remote.commands.list(sessionId)
      if (!result.ok) throw new Error(`command.list failed: ${result.error.code}: ${result.error.message}`)
      return result.value
    })
    const inputTriggers = ctx.get('inputTriggers')
    if (inputTriggers === undefined) throw new Error('ui-commands: slash service unavailable')
    ctx.effect(() => inputTriggers.registerSource({
      trigger: '/',
      name: 'command',
      candidates: (session, req) => this.candidates(session, req),
      onPick: pick => this.dispatch(pick),
      matchSpace: (session, token) => this.matchSpace(session, token),
      matchEnter: (session, line, signal, envelope) => this.matchEnter(session, line, signal, envelope),
      warm: (session) => { this.directory.warm(session.sessionId) },
    }), 'command: slash source')
    ctx.remote.$on('commands/change', () => { this.directory.invalidateAll() })
    ctx.remote.$on('agent-preset/selected', (sessionId) => { void this.directory.refresh(sessionId) })
    ctx.on('connection/reset', () => { this.directory.resetConnected() })
  }

  focusHooks = new Map()

  register(contribution) {
    const dispose = this.ctx.effect(() => {
      const { contributions } = this.live
      if (contributions.has(contribution.name)) {
        throw new Error(`ui-commands: duplicate contribution for /${contribution.name}`)
      }
      contributions.set(contribution.name, contribution)
      return () => { contributions.delete(contribution.name) }
    }, 'command.register()')
    return () => { void dispose() }
  }

  decorate(decoration) {
    const dispose = this.ctx.effect(() => {
      const { decorations } = this.live
      if (decorations.has(decoration.name)) {
        throw new Error(`ui-commands: duplicate decoration for /${decoration.name}`)
      }
      decorations.set(decoration.name, decoration)
      return () => { decorations.delete(decoration.name) }
    }, 'command.decorate()')
    return () => { void dispose() }
  }

  popupFor(actx) {
    const sessions = this.sessions()
    const id = sessions.scopeOf(actx)
    if (id === undefined) throw new Error('command.popupFor requires a session scope')
    const { popups } = this.live
    const existing = popups.get(id)
    if (existing !== undefined) return existing
    const controller = new PopupSelectController({
      consume: segment => actx.bail(actx, 'slash/input-consume-token', {
        guard: segment.via === 'menu'
          ? { kind: 'span', span: segment.span }
          : { kind: 'bare-token', token: segment.token },
      }) === true,
      focusComposer: () => { this.focusHooks.get(id)?.() },
    })
    popups.set(id, controller)
    actx.effect(() => () => {
      controller.dispose()
      popups.delete(id)
      this.focusHooks.delete(id)
    }, 'command: session popup')
    return controller
  }

  bindComposerFocus(id, focus) {
    this.focusHooks.set(id, focus)
    return () => {
      if (this.focusHooks.get(id) === focus) this.focusHooks.delete(id)
    }
  }

  async candidates(session, req) {
    const list = await this.directory.ensureReady(session.sessionId, req.signal)
    const rows = []
    const seen = new Set()
    for (const c of list) {
      seen.add(c.name)
      rows.push({ name: c.name, description: c.description, ...(c.input !== undefined ? { hint: c.input.hint } : {}) })
    }
    for (const contribution of this.live.contributions.values()) {
      if (!contribution.available(session)) continue
      if (seen.has(contribution.name)) {
        throw new Error(`ui-commands: contribution /${contribution.name} collides with a host command`)
      }
      rows.push({ name: contribution.name, description: contribution.description })
    }
    return fuzzyCandidates(
      rows.filter(c => req.position === 'leading' || c.hint === undefined),
      req.query,
    )
  }

  dispatch(pick) {
    const name = pick.candidate.name
    const contribution = this.live.contributions.get(name)
    if (contribution !== undefined && contribution.available(pick.session)) {
      this.openPopup(name, contribution.ui, pick.session, { via: 'menu', span: pick.span })
      return 'handled'
    }
    const desc = this.directory.resolve(pick.session.sessionId, name)
    if (desc === undefined) return undefined
    const decoration = this.live.decorations.get(name)
    if (decoration !== undefined && decoration.available(pick.session)) {
      this.openPopup(name, decoration.ui, pick.session, { via: 'menu', span: pick.span })
      return 'handled'
    }
    if (desc.input !== undefined) return { claim: this.leadingClaim(desc, pick.session) }
    this.consumeVia(pick.session.sessionId, { via: 'menu', span: pick.span })
    this.runDetached(desc, pick.session, `/${name}`)
    return 'handled'
  }

  matchSpace(session, token) {
    if (!token.startsWith('/')) return undefined
    const name = token.slice(1)
    if (this.live.contributions.has(name)) return undefined
    const desc = this.directory.resolve(session.sessionId, name)
    if (desc === undefined || desc.input === undefined) return undefined
    return { claim: this.leadingClaim(desc, session) }
  }

  async matchEnter(session, line, signal, envelope) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('/')) return undefined
    const ws = trimmed.search(/\s/)
    const token = ws === -1 ? trimmed : trimmed.slice(0, ws)
    const bare = ws === -1
    const name = token.slice(1)
    if (name === '') return undefined
    const refuseImages = () => {
      throw new Error(this.t('notice.imagesUnsupported', { command: name }))
    }
    const contribution = this.live.contributions.get(name)
    if (contribution !== undefined && contribution.available(session)) {
      if (!bare) return undefined
      if (envelope.images > 0) refuseImages()
      this.openPopup(name, contribution.ui, session, { via: 'enter', token })
      return 'handled'
    }
    await this.directory.ensureReady(session.sessionId, signal)
    const desc = this.directory.resolve(session.sessionId, name)
    if (desc === undefined) return undefined
    if (bare) {
      const decoration = this.live.decorations.get(name)
      if (decoration !== undefined && decoration.available(session)) {
        if (envelope.images > 0) refuseImages()
        this.openPopup(name, decoration.ui, session, { via: 'enter', token })
        return 'handled'
      }
    }
    if (desc.input !== undefined) {
      if (envelope.images > 0 && desc.input.images !== true) refuseImages()
      return { claim: this.leadingClaim(desc, session) }
    }
    if (!bare) return undefined
    if (envelope.images > 0) refuseImages()
    this.consumeVia(session.sessionId, { via: 'enter', token })
    this.runDetached(desc, session, trimmed)
    return 'handled'
  }

  openPopup(name, ui, session, segment) {
    const actx = this.scopeFor(session.sessionId)
    if (actx === undefined) return
    this.popupFor(actx).open(name, ui, session, segment)
  }

  leadingClaim(desc, session) {
    const token = `/${desc.name} `
    return {
      token,
      ...(desc.input !== undefined ? { hint: desc.input.hint } : {}),
      ...(desc.input?.images === true ? { images: true } : {}),
      submit: (args, _actx, images) => this.execute(session, token + args, images),
    }
  }

  async execute(session, line, images = []) {
    const result = await this.ctx.remote.commands.execute(session.sessionId, line, images)
    if (!result.ok) throw new Error(`command.execute failed: ${result.error.code}: ${result.error.message}`)
    if (result.value === undefined) return { kind: 'error', text: `unknown or malformed command: ${line}` }
    this.notifyExecuted(session.sessionId, submittedCommandName(line), result.value.result)
    if (images.length > 0 && result.value.result.kind === 'error') {
      return { kind: 'error', text: result.value.result.text }
    }
    return { kind: 'success' }
  }

  notifyExecuted(sessionId, name, result) {
    const args = ['command/executed', sessionId, name, result]
    for (const listener of this.ctx.events.dispatch('emit', args)) {
      try {
        const returned = listener(sessionId, name, result)
        if (returned != null && typeof returned.then === 'function') {
          void Promise.resolve(returned).then(undefined, (error) => {
            this.warnExecutedListenerFailure(name, error)
          })
        }
      } catch (error) {
        this.warnExecutedListenerFailure(name, error)
      }
    }
  }

  warnExecutedListenerFailure(name, error) {
    this.ctx.logger.warn('client command: a command/executed listener for "%s" failed', name)
    this.ctx.logger.warn(error)
  }

  runDetached(desc, session, line) {
    void this.execute(session, line).then(
      (outcome) => {
        if (outcome.kind === 'error') this.noticeFor(session.sessionId, 'error', outcome.text ?? `/${desc.name} failed`)
      },
      (error) => {
        this.noticeFor(session.sessionId, 'error', error instanceof Error ? error.message : String(error))
      },
    )
  }

  consumeVia(id, segment) {
    const actx = this.scopeFor(id)
    if (actx === undefined) return
    actx.bail(actx, 'slash/input-consume-token', {
      guard: segment.via === 'menu'
        ? { kind: 'span', span: segment.span }
        : { kind: 'bare-token', token: segment.token },
    })
  }

  noticeFor(id, level, text) {
    const actx = this.scopeFor(id)
    if (actx === undefined) return
    const conversation = actx.get('conversation')
    if (conversation === undefined) return
    conversation.input.for(actx).notify(level, text)
  }

  scopeFor(id) {
    return this.sessions().scope(id)
  }

  sessions() {
    const sessions = this.ctx.get('sessions')
    if (sessions === undefined) throw new Error('ui-commands: sessions service unavailable')
    return sessions
  }
}
