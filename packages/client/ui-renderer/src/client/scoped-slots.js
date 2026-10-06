import { createElement as h, Fragment, applyDiff } from '@freddie/webjsx'
import {
  SlotOwnershipError, StaleAuthorizationError, webjsxSlotTagOf,
  observableHook, subscribeObserved, trackReads,
} from '@freddie/freddie-client-ui-slots'
import {
  SlotAssemblyError, currentSessionMaybeProvideInfo, maybeObservableHook, projectionHook,
  sessionProviderFor,
} from './session-provider.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

const renderSlotCache = new WeakMap()

function boundRenderSlot(host, entry) {
  let binding = renderSlotCache.get(entry)
  if (!binding) {
    binding = (key, owner, opts) => {
      if (!host.isLive(entry)) {
        throw new StaleAuthorizationError(`renderSlot('${key}') from a disposed registration`)
      }
      const declared = entry.children?.[key]
      if (declared === undefined) {
        throw new SlotOwnershipError(`slot '${key}' is not declared by this entry's children`)
      }
      if (declared.kind === 'chain') {
        throw new SlotOwnershipError(`slot '${key}' is declared 'chain' — use renderSlotChain`)
      }
      return slotOutletVNode(host, key, owner, opts)
    }
    renderSlotCache.set(entry, binding)
  }
  return binding
}

const renderSlotChainCache = new WeakMap()

function boundRenderSlotChain(host, entry) {
  let binding = renderSlotChainCache.get(entry)
  if (!binding) {
    binding = (key, owner, opts) => {
      if (!host.isLive(entry)) {
        throw new StaleAuthorizationError(`renderSlotChain('${key}') from a disposed registration`)
      }
      const declared = entry.children?.[key]
      if (declared === undefined) {
        throw new SlotOwnershipError(`slot '${key}' is not declared by this entry's children`)
      }
      if (declared.kind !== 'chain') {
        throw new SlotOwnershipError(`slot '${key}' is declared '${declared.kind}', not 'chain' — use renderSlot`)
      }
      return slotOutletVNode(host, key, owner, opts)
    }
    renderSlotChainCache.set(entry, binding)
  }
  return binding
}

const rootInjectCache = new WeakMap()
const sessionInjectCache = new WeakMap()
const sessionMaybeInjectCache = new WeakMap()

const EMPTY_INJECTED_PROPS = {}

function runInject(entry, info, actions) {
  const inject = entry.inject
  if (!inject) return EMPTY_INJECTED_PROPS
  const args = []
  if (info !== undefined) args.push(info.sessionId)
  if (actions !== undefined) args.push(actions)
  return bindInjectHooks(inject(...args))
}

function bindInjectHooks(face) {
  const sources = face['hooks']
  if (sources === undefined) return face
  const { hooks: _hooks, ...rest } = face
  const bound = rest
  for (const [name, source] of Object.entries(sources)) {
    const hookName = `use${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`
    bound[hookName] = observableHook(source)
  }
  return bound
}

const slotInjectCache = new WeakMap()
const EMPTY_SLOT_INJECT = { props: EMPTY_INJECTED_PROPS }

function cachedSlotInject(face) {
  if (face === undefined) return EMPTY_SLOT_INJECT
  let bound = slotInjectCache.get(face)
  if (bound !== undefined) return bound
  const definitions = face['hooks']
  if (definitions === undefined) {
    bound = { props: face }
    slotInjectCache.set(face, bound)
    return bound
  }
  const { hooks: _hooks, ...rest } = face
  const props = rest
  let factories
  for (const [name, definition] of Object.entries(definitions)) {
    const hookName = `use${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`
    if (typeof definition === 'function') {
      factories ??= {}
      factories[name] = definition
    } else {
      props[hookName] = observableHook(definition)
    }
  }
  bound = factories === undefined
    ? { props }
    : { props, slotHookFactories: factories }
  slotInjectCache.set(face, bound)
  return bound
}

function bindSlotHookFactories(
  factories,
  standard,
  hookContext,
) {
  const hooks = {}
  for (const [name, factory] of Object.entries(factories)) {
    const hookName = `use${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`
    hooks[hookName] = factory(standard, hookContext)
  }
  return hooks
}

function cachedRootInject(entry, actions) {
  let props = rootInjectCache.get(entry)
  if (!props) {
    props = runInject(entry, undefined, actions)
    rootInjectCache.set(entry, props)
  }
  return props
}

function cachedSessionInject(entry, info, actions) {
  let perInfo = sessionInjectCache.get(entry)
  if (!perInfo) {
    perInfo = new WeakMap()
    sessionInjectCache.set(entry, perInfo)
  }
  let props = perInfo.get(info)
  if (!props) {
    props = runInject(entry, info, actions)
    perInfo.set(info, props)
  }
  return props
}

function cachedSessionMaybeInject(
  entry,
  info,
  actions,
) {
  let perInfo = sessionMaybeInjectCache.get(entry)
  if (!perInfo) {
    perInfo = new WeakMap()
    sessionMaybeInjectCache.set(entry, perInfo)
  }
  let props = perInfo.get(info)
  if (!props) {
    props = runInject(entry, info, actions)
    perInfo.set(info, props)
  }
  return props
}

const localeSeatCache = new WeakMap()

function localeSeat(face, ns) {
  let perNs = localeSeatCache.get(face)
  if (!perNs) {
    perNs = new Map()
    localeSeatCache.set(face, perNs)
  }
  const revision = face.getSnapshot().revision
  const cached = perNs.get(ns)
  if (cached && cached.revision === revision) return cached.t
  const bound = face.bind(ns)
  const t = (key, params) => bound(key, params)
  perNs.set(ns, { revision, t })
  return t
}

let nextEntryKey = 0
const entryKeys = new WeakMap()

function entryKeyOf(entry) {
  let key = entryKeys.get(entry)
  if (key === undefined) {
    key = nextEntryKey++
    entryKeys.set(entry, key)
  }
  return key
}

const standardPropsCache = new WeakMap()

function standardProps(
  host,
  scope,
  info,
) {
  let cache = standardPropsCache.get(host)
  if (cache === undefined) {
    cache = {
      root: {
        useSessions: observableHook(host.sessions.list),
        useWorkspaces: observableHook(host.workspaces.list),
      },
      session: new WeakMap(),
      sessionMaybe: new WeakMap(),
    }
    standardPropsCache.set(host, cache)
  }
  if (scope === 'root') return cache.root
  if (info === undefined) throw new SlotAssemblyError(`scope '${scope}' rendered without session provide info`)
  const byInfo = scope === 'session' ? cache.session : cache.sessionMaybe
  let standard = byInfo.get(info)
  if (standard !== undefined) return standard
  standard = { ...cache.root }
  for (const [name, source] of Object.entries(info.hooks)) {
    const hookName = `use${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`
    if (scope === 'session-maybe') {
      standard[hookName] = maybeObservableHook(source)
    } else {
      if (source === undefined) throw new SlotAssemblyError(`strict session hook '${name}' has no source`)
      standard[hookName] = observableHook(source)
    }
  }
  Object.assign(standard, info.props)
  standard['sessionId'] = info.sessionId
  standard['useProjection'] = projectionHook(info)
  byInfo.set(info, standard)
  return standard
}

function standardKit(
  host,
  entry,
  scope,
  info,
) {
  const standard = standardProps(host, scope, info)
  const kit = { ...standard }
  if (entry.locale !== undefined) {
    const face = host.locale
    if (face === undefined) {
      throw new SlotAssemblyError(
        `entry declares locale namespace '${entry.locale}' but no locale face is installed (locale plugin missing from the composition?)`)
    }
    kit['t'] = localeSeat(face, entry.locale)
  }
  const store = scope === 'session-maybe' && info?.sessionId === undefined
    ? undefined
    : host.storeOf(entry, info?.sessionId)
  if (store !== undefined) {
    kit['useStore'] = observableHook(store)
    kit['actions'] = store.actions
    kit['subscribeStore'] = (fn) => store.subscribe(fn)
  }
  if (entry.children !== undefined) {
    kit['renderSlot'] = boundRenderSlot(host, entry)
    if (Object.values(entry.children).some(spec => spec.kind === 'chain')) {
      kit['renderSlotChain'] = boundRenderSlotChain(host, entry)
    }
    if (Object.values(entry.children).some(spec => spec.scope === 'session')) {
      kit['SessionProvider'] = sessionProviderFor(host)
    }
  }
  return { kit, standard, actions: store?.actions }
}

function composeEntryProps(
  kit,
  standard,
  injected,
  slotInjected,
  ownerProps,
  hookContext,
  hasHookContext,
  slotKey,
) {
  let contextual = EMPTY_INJECTED_PROPS
  if (slotInjected.slotHookFactories !== undefined) {
    if (!hasHookContext) {
      throw new SlotAssemblyError(`slot '${slotKey}' has contextual injected Hooks but no hookContext`)
    }
    contextual = bindSlotHookFactories(slotInjected.slotHookFactories, standard, hookContext)
  }
  return { ...kit, ...injected, ...slotInjected.props, ...contextual, ...ownerProps }
}

function renderEntryVNode(
  entry,
  props,
  entryKey,
) {
  const tag = webjsxSlotTagOf(entry.component)
  if (tag !== undefined) {
    return h('freddie-entry-host', { key: entryKey, tag, entryProps: props })
  }
  const Comp = entry.component
  return Comp(props)
}

class FreddieEntryHost extends HTMLElement {
  #tag = ''
  #entryProps = EMPTY_INJECTED_PROPS
  #el = null
  #propsAssigned = false

  set tag(value) {
    if (value === this.#tag && this.#el !== null) return
    this.#tag = value
    this.#el?.remove()
    this.#el = document.createElement(value)
    this.appendChild(this.#el)
    if (this.#propsAssigned) this.#applyProps()
  }

  set entryProps(value) {
    this.#entryProps = value
    this.#propsAssigned = true
    this.#applyProps()
  }

  #applyProps() {
    const el = this.#el
    if (el === null) return
    const target = el
    if (typeof target.setProps === 'function') {
      target.setProps(this.#entryProps)
    } else {
      for (const [k, v] of Object.entries(this.#entryProps)) {
        el[k] = v
      }
    }
  }
}
defineElement('freddie-entry-host', FreddieEntryHost)

function guardedRender(slotKey, onEntryError, render) {
  try {
    return render()
  } catch (error) {
    if (error instanceof SlotAssemblyError) throw error
    console.error(`slot entry crashed in '${slotKey}':`, error)
    onEntryError(error)
    return h('div', { 'data-slot-error': slotKey })
  }
}

const FIRST_INCARNATION = { adopted: undefined, epoch: 0 }

function nextIncarnation(state, sessionId) {
  if (sessionId !== undefined && state.adopted === undefined) {
    return { adopted: sessionId, epoch: state.epoch }
  }
  if (state.adopted !== undefined && sessionId !== undefined && sessionId !== state.adopted) {
    return { adopted: sessionId, epoch: state.epoch + 1 }
  }
  if (state.adopted !== undefined && sessionId === undefined) {
    return { adopted: undefined, epoch: state.epoch + 1 }
  }
  return state
}

const ANCHOR_STYLE = 'display: contents'

function outletDepth(outlet) {
  let depth = 0
  for (let parent = outlet.parentElement; parent !== null; parent = parent.parentElement) depth++
  return depth
}

function pruneStaleOutletChildren(el) {
  while (el.children.length > 1) {
    const stale = el.children[0]
    if (stale === undefined) break
    stale.remove()
  }
}

function resyncOutletDiffCache(el) {
  const cache = el.__webjsx_childNodes
  const live = [...el.childNodes]
  if (cache !== undefined && cache.length === live.length && cache.every((n, i) => n === live[i])) return
  el.__webjsx_childNodes = live
}

class OutletRenderCycle {
  #rendering = false
  #pending = false

  run(render) {
    if (this.#rendering) {
      this.#pending = true
      return
    }
    this.#rendering = true
    try {
      do {
        this.#pending = false
        render()
      } while (this.#pending)
    } finally {
      this.#rendering = false
    }
  }

  cancel() {
    this.#pending = false
  }
}

function bindOutletSubscription(previous, source, key, onChange, subscribe) {
  if (previous !== null && previous.source === source && previous.key === key) {
    previous.onChange = onChange
    return previous
  }
  previous?.unsubscribe()
  if (source === null || source === undefined) return null
  const binding = { source, key, onChange, unsubscribe: null }
  binding.unsubscribe = subscribe(() => { binding.onChange() })
  return binding
}

class OutletSubscriptions {
  #version = null
  #locale = null
  #session = null

  connect(bindVersion, host, onChange) {
    bindVersion()
    this.bindLocale(host, onChange)
    this.bindSession(host, onChange)
  }

  disconnect() {
    this.#version?.unsubscribe()
    this.#version = null
    this.#locale?.unsubscribe()
    this.#locale = null
    this.#session?.unsubscribe()
    this.#session = null
  }

  bindVersion(host, key, onChange) {
    this.#version = bindOutletSubscription(this.#version, host, key, onChange,
      listener => host.subscribe(key, listener))
  }

  bindLocale(host, onChange) {
    const face = host()?.locale
    this.#locale = bindOutletSubscription(this.#locale, face, undefined, onChange,
      listener => face.subscribe(listener))
  }

  bindSession(host, onChange) {
    const source = host()?.sessions.provideInfo
    this.#session = bindOutletSubscription(this.#session, source, undefined, onChange,
      listener => source.subscribe(listener))
  }
}

export class FreddieSlotOutlet extends HTMLElement {
  #host = null
  #slotKey = ''
  #ownerProps = {}
  #opts
  #subscriptions = new OutletSubscriptions()
  #maybeIncarnation = FIRST_INCARNATION
  #hookUnsubscribes = []
  #boundHookSources = []
  #readRevisions = new Map()
  #renderCycle = new OutletRenderCycle()

  #renderedOnce = false

  setProps(props) {
    this.#host = props.host
    this.#slotKey = props.slotKey
    this.#ownerProps = props.ownerProps
    this.#opts = props.opts
    if (this.isConnected) {
      this.#bindVersion()
      this.#subscriptions.bindLocale(() => this.#host, () => { this.#render() })
      this.#subscriptions.bindSession(() => this.#host, () => { this.#render() })
    }
    this.#render()
  }

  connectedCallback() {
    this.#subscriptions.connect(
      () => { this.#bindVersion() },
      () => this.#host,
      () => { if (this.#renderedOnce) this.#render() },
    )
    this.#render()
  }

  disconnectedCallback() {
    this.#renderCycle.cancel()
    this.#subscriptions.disconnect()
    this.#unbindHookSources()
  }

  #bindVersion() {
    const host = this.#host
    this.#subscriptions.bindVersion(host, this.#slotKey, () => { this.#render() })
  }

  #unbindHookSources() {
    for (const unsubscribe of this.#hookUnsubscribes) unsubscribe()
    this.#hookUnsubscribes = []
    this.#boundHookSources = []
    this.#readRevisions = new Map()
  }

  #bindHookSources(sessionInfo, reads, revisions) {
    this.#readRevisions = revisions
    const sources = [...new Set([
      ...Object.values(sessionInfo.hooks).filter((s) => s !== undefined),
      ...reads,
    ])]
    const unchanged = sources.length === this.#boundHookSources.length
      && sources.every((s, i) => s === this.#boundHookSources[i])
    if (unchanged) return
    this.#unbindHookSources()
    this.#readRevisions = revisions
    this.#boundHookSources = sources
    this.#hookUnsubscribes = sources.map(source => subscribeObserved(source, (revision) => {
      if (this.#readRevisions.get(source) !== revision) this.#render()
    }, () => outletDepth(this)))
  }

  #render() {
    this.#renderCycle.run(() => { this.#renderContent() })
  }

  #renderContent() {
    const host = this.#host
    if (host === null) return
    resyncOutletDiffCache(this)
    const sessionInfo = currentSessionMaybeProvideInfo(host)
    const { reads, revisions } = trackReads(() => {
      const content = renderOutletContent(host, this.#slotKey, this.#ownerProps, this.#opts, sessionInfo, this.#maybeIncarnation, (next) => {
        this.#maybeIncarnation = next
      })
      applyDiff(this, h('div', { 'data-slot': this.#slotKey, style: ANCHOR_STYLE }, content))
    })
    if (!this.isConnected) return
    this.#bindHookSources(sessionInfo, reads, revisions)
    pruneStaleOutletChildren(this)
    this.#renderedOnce = true
  }
}
defineElement('freddie-slot-outlet', FreddieSlotOutlet)

function slotOutletVNode(
  host,
  slotKey,
  ownerProps,
  opts,
) {
  return h('freddie-slot-outlet', {
    ref: (node) => {
      node?.setProps({ host, slotKey, ownerProps, opts })
    },
  })
}

function renderOutletContent(
  host,
  slotKey,
  ownerProps,
  opts,
  sessionInfo,
  maybeIncarnation,
  setMaybeIncarnation,
) {
  const spec = host.specOf(slotKey)
  if (!spec) return null
  const strictSessionAbsent = spec.scope === 'session' && sessionInfo.sessionId === undefined
  if (strictSessionAbsent && (spec.kind !== 'chain' || !opts?.overlay)) {
    return (opts?.fallback) ?? null
  }
  const entries = strictSessionAbsent ? [] : host.entriesOf(slotKey)
  const slotInjected = cachedSlotInject(spec.inject)

  const guarded = (entry, entryKeyValue, owner = ownerProps, matched) => {
    const hasHookContext = opts !== undefined && Object.hasOwn(opts, 'hookContext')
    const hookContext = opts?.hookContext
    const onEntryError = (error) => {
      host.reportEntryError(slotKey, entry, error, { abdicate: spec.kind !== 'chain' })
    }
    const inner = guardedRender(slotKey, onEntryError, () => {
      if (spec.scope === 'session') {
        if (sessionInfo.sessionId === undefined) return h(Fragment, null)
        const info = sessionInfo
        const { kit, standard, actions } = standardKit(host, entry, 'session', info)
        const injected = cachedSessionInject(entry, info, actions)
        const props = composeEntryProps(kit, standard, injected, slotInjected,
          matched === undefined ? owner : { ...owner, matched }, hookContext, hasHookContext, slotKey)
        return h('div', { key: info.sessionId, style: ANCHOR_STYLE },
          renderEntryVNode(entry, props, entryKeyOf(entry)),
        )
      }
      if (spec.scope === 'session-maybe') {
        const next = nextIncarnation(maybeIncarnation, sessionInfo.sessionId)
        if (next !== maybeIncarnation) setMaybeIncarnation(next)
        const infoForRender = { ...sessionInfo, sessionId: next.adopted }
        const { kit, standard, actions } = standardKit(host, entry, 'session-maybe', infoForRender)
        const injected = cachedSessionMaybeInject(entry, infoForRender, actions)
        const props = composeEntryProps(kit, standard, injected, slotInjected,
          matched === undefined ? owner : { ...owner, matched }, hookContext, hasHookContext, slotKey)
        return h('div', { key: next.epoch, style: ANCHOR_STYLE },
          renderEntryVNode(entry, props, entryKeyOf(entry)),
        )
      }
      const { kit, standard, actions } = standardKit(host, entry, 'root', undefined)
      const injected = cachedRootInject(entry, actions)
      const props = composeEntryProps(kit, standard, injected, slotInjected,
        matched === undefined ? owner : { ...owner, matched }, hookContext, hasHookContext, slotKey)
      return renderEntryVNode(entry, props, entryKeyOf(entry))
    })
    return h('div', { key: entryKeyValue, style: ANCHOR_STYLE }, inner)
  }

  const deadCell = () => h('div', { 'data-slot-error': slotKey })

  if (spec.kind === 'single') {
    const entry = host.entriesOfSlot(slotKey)[0]
    if (!entry) return entries.length > 0 ? deadCell() : ((opts?.fallback) ?? null)
    return guarded(entry, entryKeyOf(entry))
  }
  if (spec.kind === 'keyed') {
    const entry = host.entriesOfSlot(slotKey).find(e => e.options.key === opts?.entryKey)
    if (!entry) {
      const occupied = entries.some(e => e.options.key === opts?.entryKey)
      return occupied ? deadCell() : ((opts?.fallback) ?? null)
    }
    return guarded(entry, entryKeyOf(entry))
  }
  if (spec.kind === 'chain') {
    let elected = null
    for (const entry of entries) {
      let matched
      try {
        matched = entry.select(ownerProps)
      } catch (error) {
        console.error(
          `chain selector crashed in '${slotKey}' (${entry.registrant ?? 'unknown registrant'}), treating as declined:`,
          error)
        continue
      }
      if (matched !== null) {
        elected = guarded(entry, entryKeyOf(entry), ownerProps, matched)
        break
      }
    }
    if (opts?.overlay) {
      const fallbackStyle = `display: ${elected === null ? 'contents' : 'none'}`
      return [
        h('div', { 'data-chain-overlay-fallback': slotKey, style: fallbackStyle },
          (opts.fallback) ?? null,
        ),
        elected,
      ]
    }
    return elected ?? ((opts?.fallback) ?? null)
  }
  const winners = host.entriesOfSlot(slotKey)
  const rows = winners.map(entry => ({
    entry,
    id: entry.options.id,
    order: entry.options.order ?? 0,
  }))
  const rowIds = new Set(rows.map(row => row.id))
  for (const entry of entries) {
    if (rowIds.has(entry.options.id)) continue
    rowIds.add(entry.options.id)
    rows.push({ entry: undefined, id: entry.options.id, order: entry.options.order ?? 0 })
  }
  let list = [...rows].sort((a, b) => a.order - b.order)
  if (opts?.only !== undefined) list = list.filter(item => item.id === opts.only)
  if (list.length === 0) return (opts?.fallback) ?? null
  return list.map(item => item.entry !== undefined
    ? guarded(item.entry, `e${entryKeyOf(item.entry)}`)
    : h('div', { 'data-slot-error': slotKey, key: `x${item.id}` }))
}

export class FreddieRootOutlet extends HTMLElement {
  #host = null
  #ownerProps = {}
  #subscriptions = new OutletSubscriptions()
  #readUnsubscribes = []
  #boundReads = []
  #readRevisions = new Map()
  #renderCycle = new OutletRenderCycle()
  #renderedOnce = false

  setProps(props) {
    this.#host = props.host
    this.#ownerProps = props.ownerProps
    if (this.isConnected) {
      this.#bindVersion()
      this.#subscriptions.bindLocale(() => this.#host, () => { this.#render() })
    }
    this.#render()
  }

  #bindReads(reads, revisions) {
    this.#readRevisions = revisions
    const sources = [...reads]
    const unchanged = sources.length === this.#boundReads.length
      && sources.every((s, i) => s === this.#boundReads[i])
    if (unchanged) return
    for (const unsubscribe of this.#readUnsubscribes) unsubscribe()
    this.#boundReads = sources
    this.#readUnsubscribes = sources.map(source => subscribeObserved(source, (revision) => {
      if (this.#readRevisions.get(source) !== revision) this.#render()
    }, () => outletDepth(this)))
  }

  // oxlint-disable-next-line sonarjs/no-identical-functions
  connectedCallback() {
    this.#subscriptions.connect(
      () => { this.#bindVersion() },
      () => this.#host,
      () => { if (this.#renderedOnce) this.#render() },
    )
    this.#render()
  }

  disconnectedCallback() {
    this.#renderCycle.cancel()
    this.#subscriptions.disconnect()
    for (const unsubscribe of this.#readUnsubscribes) unsubscribe()
    this.#readUnsubscribes = []
    this.#boundReads = []
    this.#readRevisions = new Map()
  }

  #bindVersion() {
    const host = this.#host
    this.#subscriptions.bindVersion(host, 'root', () => { this.#render() })
  }

  #render() {
    this.#renderCycle.run(() => { this.#renderContent() })
  }

  #renderContent() {
    const host = this.#host
    if (host === null) return
    resyncOutletDiffCache(this)
    const entry = host.entriesOfSlot('root')[0]
    let content
    if (!entry) {
      if (host.entriesOf('root').length > 0) {
        content = h('div', { 'data-slot-error': 'root' })
      } else if (this.#renderedOnce) {
        content = null
      } else {
        throw new SlotAssemblyError("renderSlot('root') before any 'root' registration (boot order)")
      }
    } else {
      const onEntryError = (error) => {
        host.reportEntryError('root', entry, error, { abdicate: true })
      }
      content = guardedRender('root', onEntryError, () => {
        const { kit, standard, actions } = standardKit(host, entry, 'root', undefined)
        const injected = cachedRootInject(entry, actions)
        const props = composeEntryProps(kit, standard, injected, EMPTY_SLOT_INJECT,
          this.#ownerProps, undefined, false, 'root')
        return renderEntryVNode(entry, props, entryKeyOf(entry))
      })
    }
    const { reads, revisions } = trackReads(() => {
      applyDiff(this, h('div', { 'data-slot': 'root', style: ANCHOR_STYLE }, content))
    })
    if (!this.isConnected) return
    this.#bindReads(reads, revisions)
    pruneStaleOutletChildren(this)
    this.#renderedOnce = true
  }
}
defineElement('freddie-root-outlet', FreddieRootOutlet)

export function createSlotRenderer() {
  return {
    renderRoot(host, ownerProps) {
      return h('freddie-root-outlet', {
        ref: (node) => {
          node?.setProps({ host, ownerProps })
        },
      })
    },
  }
}
