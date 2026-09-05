/**
 * webjsx renderer for declarative slots. Per-entry bindings enforce child
 * authorization, and entry boundaries contain registrant failures.
 *
 * Converted from React to webjsx (see docs on each outlet class below for the
 * concrete pattern each replaces): HostContext/SessionContext become
 * explicit `host`/`info` fields threaded through render calls (no context);
 * useSyncExternalStore becomes explicit subscribe in connectedCallback +
 * unsubscribe in disconnectedCallback, triggering `#render()`
 * (Toast.tsx/CodeBlock.tsx's pattern); the SlotErrorBoundary React class
 * becomes a manual try/catch around the guarded render call, rendering the
 * crash-face markup on catch; entry-identity-keyed remounting is manual DOM
 * teardown (`replaceChildren`) when the winning entry's identity changes.
 *
 * webjsxSlot() indirection: KEPT. 14 registrant packages call
 * `webjsxSlot('tag-name')` directly at their `register()` call site — that
 * marker function returns `null` and carries `WEBJSX_SLOT_TAG`, so it is
 * fundamentally different from a plain function registrant (which webjsx
 * itself also uses for its "create-or-update, return as JSX.Element" idiom,
 * see Toast.tsx/Menu.tsx/CodeBlock.tsx's exported helpers). The dispatch
 * layer below still branches on `webjsxSlotTagOf(component)`: tagged means
 * "create/reuse this custom-element tag", untagged means "call this function
 * with composed props and use the returned VNode". Both paths are now
 * webjsx-native — the former React bridge component (WebjsxBridge) is
 * removed; a tagged entry's custom element is created directly and updated
 * via its `setProps` (or plain field assignment), uniformly with how
 * ui-primitives' own registrants already work.
 */
import { createElement as h, Fragment, applyDiff } from 'webjsx'
import {
  SlotOwnershipError, StaleAuthorizationError, webjsxSlotTagOf,
} from '@freddie/freddie-client-ui-slots'
import {
  SlotAssemblyError, currentSessionMaybeProvideInfo, maybeObservableHook, observableHook, projectionHook,
  sessionProviderFor,
} from './session-provider.js'

/**
 * Per-entry renderSlot / renderSlotChain bindings, called from inside a
 * registrant's render body. Each returns a `<freddie-slot-outlet>` VNode (a
 * custom element that owns its own dispatch/subscription lifecycle) instead
 * of React elements — applyDiff reconciles it by `key` like any other node.
 */

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

/**
 * Entry-identity keys for entry boundaries — unchanged plain-JS WeakMap
 * cache. An outlet remounts its boundary fresh whenever the winning entry's
 * identity changes (re-election, shadowing fallback, HMR re-registration),
 * so a boundary that failed on entry A never survives to black out entry B.
 */
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

/**
 * Compose one entry's full props object (standard kit + cached entry inject +
 * common slot inject + contextual slot hooks + owner props, owner wins).
 * Pure data assembly — no rendering; the caller decides how to turn this into
 * a VNode (bare-function call vs. tagged-custom-element props).
 */
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

/**
 * Render one entry to a VNode. `entry.component` is either:
 *  - a bare function registrant (call it with the composed props, use the
 *    returned VNode directly — the webjsx-JSX-returning-stateless-function
 *    convention every converted registrant package now follows), or
 *  - a `webjsxSlot(tag)` marker: create (or reuse, keyed by entry identity)
 *    the named custom element and drive it via `setProps`/plain-field
 *    assignment (same convention as ui-primitives' own `renderMenu`/
 *    `renderCodeBlock`/`mountToast` helpers), returned as a keyed VNode so
 *    applyDiff preserves its identity across re-renders of the parent.
 */
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

/**
 * Custom element hosting one webjsxSlot(tag)-tagged entry: creates the named
 * tag on connect (or reuses it across `applyDiff` updates via its stable
 * `key`), and drives it through `setProps` when present, else plain-field
 * assignment — the exact convention `WebjsxBridge` used to bridge into
 * React, now the terminal case (no bridge needed, webjsx owns the whole tree).
 */
class FreddieEntryHost extends HTMLElement {
  #tag = ''
  #entryProps = EMPTY_INJECTED_PROPS
  #el = null
  // JSX attribute declaration order (`tag` before `entryProps`) drives which
  // setter webjsx's applyDiff invokes first on initial mount — `tag` always
  // fires first for this element's call sites. Without this flag, `set tag`'s
  // own #applyProps() call would drive the freshly-created element's
  // setProps() with the still-default EMPTY_INJECTED_PROPS (no useStore/
  // actions/etc.), one JS tick before `set entryProps` ever runs. Real props
  // apply only once `entryProps` has been assigned at least once; `set tag`
  // just creates the element and waits.
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
if (typeof customElements !== 'undefined' && customElements.get('freddie-entry-host') === undefined) {
  customElements.define('freddie-entry-host', FreddieEntryHost)
}

/**
 * Per-entry crash boundary: wraps `render()` in try/catch. On crash it
 * renders the `data-slot-error` crash face and reports through
 * `onEntryError` — the manual replacement for React's
 * getDerivedStateFromError/componentDidCatch. This does not catch errors
 * thrown later from async work or from inside a custom element's own
 * lifecycle callbacks (only the synchronous render call is guarded) — an
 * accepted, documented gap matching the earlier blocked attempt's own
 * conclusion.
 */
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

/**
 * Session-maybe identity: adoption — the ONLY behavior (there is no
 * hold-identity-forever mode). An incarnation born session-less ADOPTS the
 * first session that arrives: identity holds across that one transition
 * (undefined → first id). From then on the entry behaves exactly like a
 * strict session entry: switching to a DIFFERENT session remounts, and
 * dropping back to no-session remounts into a fresh blank incarnation, which
 * will adopt again. Bookkeeping now lives on the owning outlet instance
 * (`#maybeIncarnation`) instead of a React child component's setState-in-render
 * trick — the outlet already tracks winner identity per render, so this is
 * one more piece of the same imperative bookkeeping.
 */
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

/**
 * Anchor style shared by every outlet: `display:contents` keeps the wrapper
 * out of layout, so the anchor is purely addressable surface.
 */
const ANCHOR_STYLE = 'display: contents'

/**
 * Slot outlet custom element — replaces the React `SlotOutlet` function
 * component. `host`/`slotKey`/`ownerProps`/`opts` land as plain instance
 * fields (webjsx property convention, see Toast.tsx's `setProps`); the
 * registration-version and locale-revision `useSyncExternalStore`
 * subscriptions become explicit `host.subscribe`/locale-face `subscribe`
 * calls bound in `connectedCallback` and torn down in
 * `disconnectedCallback`, each re-invoking `#render()` on notification.
 */
/**
 * Prune stale duplicate `[data-slot]` wrapper children an outlet's applyDiff
 * pass may have left behind (see the callers' comments for the observed
 * webjsx diff-cache desync this guards). Keeps the last child — the wrapper
 * the render just produced or updated — and removes any earlier ones.
 * A no-op when the element already has zero or one child (the normal case).
 */
function pruneStaleOutletChildren(el) {
  while (el.children.length > 1) {
    const stale = el.children[0]
    if (stale === undefined) break
    stale.remove()
  }
}

/**
 * Reset webjsx's internal per-element diff bookkeeping (the
 * `__webjsx_childNodes` cache `applyDiff` reads as its "previous render"
 * baseline) to match what the DOM actually holds right now. Safe no-op on
 * the normal path (cache already agrees with the DOM); guards specifically
 * against the observed desync where a burst of re-renders leaves the cache
 * reporting a stale child count.
 */
function resyncOutletDiffCache(el) {
  const cache = el.__webjsx_childNodes
  const live = [...el.childNodes]
  if (cache !== undefined && cache.length === live.length && cache.every((n, i) => n === live[i])) return
  el.__webjsx_childNodes = live
}

/**
 * Owns one outlet's version + locale subscription lifecycle, shared by
 * FreddieSlotOutlet and FreddieRootOutlet: connect binds both and renders once
 * already-seen, disconnect tears both down, and locale rebinds fresh on
 * every call (the face itself may change or (dis)appear between renders).
 */
class OutletSubscriptions {
  #unsubscribeVersion = null
  #unsubscribeLocale = null
  #unsubscribeSession = null

  connect(bindVersion, host, onChange) {
    bindVersion()
    this.bindLocale(host, onChange)
    this.bindSession(host, onChange)
  }

  disconnect() {
    this.#unsubscribeVersion?.()
    this.#unsubscribeVersion = null
    this.#unsubscribeLocale?.()
    this.#unsubscribeLocale = null
    this.#unsubscribeSession?.()
    this.#unsubscribeSession = null
  }

  bindVersion(unsubscribe) {
    this.#unsubscribeVersion?.()
    this.#unsubscribeVersion = unsubscribe
  }

  bindLocale(host, onChange) {
    this.#unsubscribeLocale?.()
    const face = host()?.locale
    this.#unsubscribeLocale = face === undefined ? null : face.subscribe(onChange)
  }

  /**
   * Subscribe to the current-session provide projection: switching sessions
   * (sessions.open) publishes through this source (SessionProvideChannel.
   * publishCurrent), but nothing else in the outlet's render-trigger set
   * (slot-registration version, locale) fires on that change — without this,
   * currentSessionMaybeProvideInfo(host) reads fresh sessionId only on the
   * NEXT render, which the outlet never schedules on its own for a pure
   * session switch. Re-bound every connect (host's session source is stable
   * for the renderer's lifetime, but rebinding here mirrors bindLocale's
   * defensive re-fetch-per-call contract).
   */
  bindSession(host, onChange) {
    this.#unsubscribeSession?.()
    const source = host()?.sessions.provideInfo
    this.#unsubscribeSession = source === undefined ? null : source.subscribe(onChange)
  }
}

export class FreddieSlotOutlet extends HTMLElement {
  #host = null
  #slotKey = ''
  #ownerProps = {}
  #opts
  #subscriptions = new OutletSubscriptions()
  #maybeIncarnation = FIRST_INCARNATION
  // Sources currently subscribed from the last-rendered sessionInfo.hooks
  // roster (e.g. the per-session Session object behind useSession) — see
  // #bindHookSources below for why this exists.
  #hookUnsubscribes = []
  #boundHookSources = []

  // setProps() runs synchronously inside webjsx's own createDOMElement (via
  // the `ref` callback), i.e. BEFORE this element is inserted into the real
  // document — connectedCallback fires only afterward, once insertion lands.
  // Rendering in both places double-renders the very first mount: the
  // pre-connection render's applyDiff(this, vdom) runs against a detached
  // node, then connectedCallback's applyDiff runs again immediately after
  // insertion. webjsx's diff cache (element.__webjsx_childNodes, a plain
  // instance property, not DOM-derived) should stay consistent across that
  // sequence, but empirically it does not: the live DOM ends up with two
  // `[data-slot]` children while the cache reports only one, i.e. the two
  // back-to-back applyDiff calls around the detach→attach boundary produce a
  // duplicate node webjsx's own bookkeeping never sees. Skipping the second,
  // now-redundant render on first connect (setProps already rendered
  // everything connectedCallback would) removes the double-render window
  // entirely; later re-renders (subscriptions, setProps updates) are
  // untouched.
  #renderedOnce = false

  setProps(props) {
    this.#host = props.host
    this.#slotKey = props.slotKey
    this.#ownerProps = props.ownerProps
    this.#opts = props.opts
    this.#bindVersion()
    this.#subscriptions.bindLocale(() => this.#host, () => { this.#render() })
    this.#subscriptions.bindSession(() => this.#host, () => { this.#render() })
    this.#render()
  }

  // Required HTMLElement lifecycle hook name; body is unavoidably the same
  // shape as FreddieRootOutlet's (both delegate to the shared OutletSubscriptions
  // helper above) since custom-element lifecycle methods cannot be inherited
  // from a shared base without a larger structural change.
  connectedCallback() {
    this.#subscriptions.connect(
      () => { this.#bindVersion() },
      () => this.#host,
      () => { if (this.#renderedOnce) this.#render() },
    )
  }

  disconnectedCallback() {
    this.#subscriptions.disconnect()
    this.#unbindHookSources()
  }

  #bindVersion() {
    const host = this.#host
    this.#subscriptions.bindVersion(host === null ? null : host.subscribe(this.#slotKey, () => { this.#render() }))
  }

  #unbindHookSources() {
    for (const unsubscribe of this.#hookUnsubscribes) unsubscribe()
    this.#hookUnsubscribes = []
    this.#boundHookSources = []
  }

  /**
   * Subscribe to every hook source in the current sessionInfo.hooks roster
   * (e.g. the per-session Session object behind `useSession`). standardKit's
   * `useSession`/`use<Name>` readers (observableHook -> bindSnapshotSelector)
   * are pure synchronous `getSnapshot()` wrappers with no subscription of
   * their own — see bind.ts's own doc comment: "Callers that need change
   * notification subscribe to source.subscribe directly." The outlet is that
   * caller: without this, a session's own internal state change (e.g.
   * Session.openState flipping loading -> open on history load, via
   * notifier.markDirty()) has nothing in the outlet's render-trigger set to
   * fire on, so the strict session slot (ChatView et al.) stays rendered
   * against the stale snapshot it saw at mount — the "stuck on Loading
   * history..." symptom. Re-bound every render since a session switch swaps
   * every source's identity (compared by reference against the last-bound
   * set, so a same-session re-render is a no-op resubscribe, not a churn).
   */
  #bindHookSources(sessionInfo) {
    const sources = Object.values(sessionInfo.hooks).filter(
      (s) => s !== undefined,
    )
    const unchanged = sources.length === this.#boundHookSources.length
      && sources.every((s, i) => s === this.#boundHookSources[i])
    if (unchanged) return
    this.#unbindHookSources()
    this.#boundHookSources = sources
    this.#hookUnsubscribes = sources.map(source => source.subscribe(() => { this.#render() }))
  }

  #render() {
    const host = this.#host
    if (host === null) return
    // Defensive, BEFORE diffing: webjsx's per-element diff cache
    // (element.__webjsx_childNodes / __webjsx_props.children) has been
    // observed to desync from this outlet's live DOM across a burst of
    // rapid re-renders (e.g. many renders queued in the same tick) —
    // `applyDiff` then reads a stale "one child" bookkeeping against
    // whatever the DOM actually holds, and depending on which desynced it
    // either orphans an extra `[data-slot]` wrapper alongside the current
    // one (duplicate content) or loses track of the real one entirely
    // (content vanishes). Resetting the cache to exactly what the live DOM
    // holds right before diffing gives every render pass a consistent,
    // correct baseline regardless of how many renders raced before it.
    resyncOutletDiffCache(this)
    const sessionInfo = currentSessionMaybeProvideInfo(host)
    this.#bindHookSources(sessionInfo)
    const content = renderOutletContent(host, this.#slotKey, this.#ownerProps, this.#opts, sessionInfo, this.#maybeIncarnation, (next) => {
      this.#maybeIncarnation = next
    })
    const vdom = h('div', { 'data-slot': this.#slotKey, style: ANCHOR_STYLE },
      content,
    )
    applyDiff(this, vdom)
    pruneStaleOutletChildren(this)
    this.#renderedOnce = true
  }
}
if (typeof customElements !== 'undefined' && customElements.get('freddie-slot-outlet') === undefined) {
  customElements.define('freddie-slot-outlet', FreddieSlotOutlet)
}

/**
 * Build a `<freddie-slot-outlet>` VNode for one renderSlot/renderSlotChain call
 * site. The host API and dispatch opts are multi-field, must-update-together
 * state, so they route through the `ref` callback's imperative `setProps`
 * call (the same pattern ui-primitives' own `renderMenu`/`renderCodeBlock`
 * helpers use for their complex prop objects) rather than as individual JSX
 * attributes — this is the direct replacement for `WebjsxBridge`'s React
 * indirection, now the terminal case.
 */
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

/** Kind dispatch behind the outlet anchor (single/keyed/list/chain, fallbacks, crash faces). */
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

  // The outer wrapper is keyed by entry identity (entryKeyValue): a winner
  // change (re-election, shadowing fallback, HMR re-registration) gets a
  // DIFFERENT key, so applyDiff creates a fresh subtree instead of updating
  // the previous winner's DOM in place — the manual equivalent of React's
  // key-driven remount, since webjsx's own keyed-list diffing (verified
  // above in applyDiff.js) only reuses a node when the new key matches an
  // existing one.
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
        return h('div', { key: info.sessionId },
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
        return h('div', { key: next.epoch },
          renderEntryVNode(entry, props, entryKeyOf(entry)),
        )
      }
      const { kit, standard, actions } = standardKit(host, entry, 'root', undefined)
      const injected = cachedRootInject(entry, actions)
      const props = composeEntryProps(kit, standard, injected, slotInjected,
        matched === undefined ? owner : { ...owner, matched }, hookContext, hasHookContext, slotKey)
      return renderEntryVNode(entry, props, entryKeyOf(entry))
    })
    return h('div', { key: entryKeyValue }, inner)
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
  // list: one row per id cell.
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

/**
 * Root outlet custom element — replaces the React `RootOutlet` function
 * component. Same subscribe/render lifecycle as `FreddieSlotOutlet`; kept
 * distinct because 'root' has its own boot-order assembly-failure contract
 * (throwing before any registration exists) that ordinary slots don't.
 */
export class FreddieRootOutlet extends HTMLElement {
  #host = null
  #ownerProps = {}
  #subscriptions = new OutletSubscriptions()
  // See FreddieSlotOutlet's #renderedOnce: setProps() renders synchronously
  // pre-connection (webjsx's ref callback fires inside createDOMElement,
  // before insertion); connectedCallback firing #render() again right after
  // desyncs webjsx's own diff cache from the live DOM and duplicates the
  // rendered subtree. Skip the redundant first connectedCallback render.
  #renderedOnce = false

  setProps(props) {
    this.#host = props.host
    this.#ownerProps = props.ownerProps
    this.#bindVersion()
    this.#subscriptions.bindLocale(() => this.#host, () => { this.#render() })
    this.#render()
  }

  // Required HTMLElement lifecycle hook name; body is unavoidably the same
  // shape as FreddieSlotOutlet's (both delegate to the shared OutletSubscriptions
  // helper above) since custom-element lifecycle methods cannot be inherited
  // from a shared base without a larger structural change.
  // oxlint-disable-next-line sonarjs/no-identical-functions
  connectedCallback() {
    this.#subscriptions.connect(
      () => { this.#bindVersion() },
      () => this.#host,
      () => { if (this.#renderedOnce) this.#render() },
    )
  }

  disconnectedCallback() { this.#subscriptions.disconnect() }

  #bindVersion() {
    const host = this.#host
    this.#subscriptions.bindVersion(host === null ? null : host.subscribe('root', () => { this.#render() }))
  }

  #render() {
    const host = this.#host
    if (host === null) return
    resyncOutletDiffCache(this)
    const entry = host.entriesOfSlot('root')[0]
    let content
    if (!entry) {
      if (host.entriesOf('root').length > 0) {
        content = h('div', { 'data-slot-error': 'root' })
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
    const vdom = h('div', { 'data-slot': 'root', style: ANCHOR_STYLE },
      content,
    )
    applyDiff(this, vdom)
    // See FreddieSlotOutlet's identical call for why this is needed.
    pruneStaleOutletChildren(this)
    this.#renderedOnce = true
  }
}
if (typeof customElements !== 'undefined' && customElements.get('freddie-root-outlet') === undefined) {
  customElements.define('freddie-root-outlet', FreddieRootOutlet)
}

/**
 * Build the renderer the shell installs into the runtime SlotRegistry
 * (ctx.slots.install(createSlotRenderer()) at boot).
 * @returns the renderer.
 */
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
