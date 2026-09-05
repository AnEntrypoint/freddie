/** Strict per-session header/body content inserted into the resident conversation layout.
 *
 * Converted from React hooks components to webjsx custom elements: the
 * `useSyncExternalStore(views.subscribe, ...)` subscription becomes an
 * explicit `views.subscribe` call in `connectedCallback` (unsubscribed in
 * `disconnectedCallback`, ReadBlock.tsx's grammar-subscription pattern), and
 * the mount-only draft-mirror / image-release effects become
 * connectedCallback/disconnectedCallback bodies.
 */

import { applyDiff, createElement as h } from 'webjsx'
import clsx from 'clsx'
import css from './ConversationRoot.css.js'

const DEFAULT_VIEW_ID = 'chat'

/** Resolve by id and keep stale persisted selections on the stable Chat fallback. */
function resolveActiveView(tabs, selectedId) {
  const requestedId = selectedId ?? DEFAULT_VIEW_ID
  return tabs.find(view => view.id === requestedId)
    ?? tabs.find(view => view.id === DEFAULT_VIEW_ID)
}

function deriveAncestry(list, id) {
  const chain = []
  const seen = new Set()
  let cursor = id
  while (cursor !== undefined) {
    if (seen.has(cursor)) break
    seen.add(cursor)
    const summary = list.byId[cursor]
    if (summary === undefined) break
    chain.unshift({
      id: summary.id,
      displayTitle: summary.displayTitle,
      subagent: summary.origin === 'subagent',
    })
    if (summary.origin !== 'subagent') break
    cursor = summary.parentId
  }
  return chain
}

/**
 * Session header chrome custom element: subscribes to the view ledger for its
 * only reactive input beyond the standard session kit.
 */
export class FreddieConversationSessionHeader extends HTMLElement {
  #props = null
  #unsubscribeViews = null
  #unsubscribeStore = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    if (this.#props !== null) {
      this.#unsubscribeViews = this.#props.views.subscribe(() => { this.#render() })
      // The active tab (chat store's `view` field) is written by
      // actions.setView but `useStore` is a plain non-subscribing reader
      // (bind.ts) — without this the tab bar never learns a click landed.
      this.#unsubscribeStore = this.#props.subscribeStore(() => { this.#render() })
    }
    this.#render()
  }

  disconnectedCallback() {
    this.#unsubscribeViews?.()
    this.#unsubscribeViews = null
    this.#unsubscribeStore?.()
    this.#unsubscribeStore = null
  }

  #render() {
    if (this.#props === null) return
    const { sessionId, useSession, useSessions, useStore, actions, renderSlot, views, open, t } = this.#props
    const tabs = views.list()
    const selectedId = useStore(s => s.view)
    const active = resolveActiveView(tabs, selectedId)
    // Custom equality (breadcrumb id+title) dropped: #render is only invoked
    // on an actual props/subscription change, not on every session-store
    // tick, so the extra-render guard the comparator existed for is moot here.
    const ancestry = useSessions(s => deriveAncestry(s, sessionId))
    const composerPhase = useSession(s => s.composerPhase)
    const blank = useSession(s => s.blank)
    const hideChrome = blank && composerPhase === 'blank'

    const vdom = h(
      'header',
      {
        class: clsx(css.header, hideChrome && css.headerHidden),
        'aria-hidden': hideChrome || undefined,
      },
      !hideChrome && [
        h(
          'div',
          { class: css.titleRow ?? '' },
          h(
            'div',
            { class: css.titleCluster ?? '' },
            h(
              'nav',
              { class: css.crumbs ?? '', 'aria-label': t('session.hierarchy') },
              ancestry.map((summary, index) => {
                const last = index === ancestry.length - 1
                const title = h(
                  'button',
                  {
                    type: 'button',
                    class: clsx(
                      css.crumb,
                      summary.subagent && css.crumbSubagent,
                      last && css.crumbCurrent,
                    ),
                    disabled: last,
                    onclick: () => { open(summary.id) },
                  },
                  summary.displayTitle,
                )
                const lineage = last || summary.subagent
                const lineageOwner = {
                  lineageSessionId: summary.id,
                  displayTitle: summary.displayTitle,
                  ...last ? {} : { openTitle: () => { open(summary.id) } },
                }
                return h(
                  'span',
                  { key: summary.id, class: css.crumbSeg ?? '' },
                  index > 0 && h('span', { class: css.crumbSep ?? '' }, '/'),
                  lineage
                    ? summary.subagent
                      ? renderSlot(
                        'conversation.session.header.lineage',
                        lineageOwner,
                        { fallback: title },
                      )
                      : [
                        title,
                        renderSlot(
                          'conversation.session.header.lineage',
                          lineageOwner,
                          { fallback: null },
                        ),
                      ]
                    : title,
                )
              }),
              ancestry.length === 0 && h('span', { class: css.crumbCurrent ?? '' }, sessionId),
            ),
            h(
              'div',
              { class: css.headerActions ?? '' },
              renderSlot('conversation.session.header.actions', {}),
            ),
          ),
          h(
            'div',
            { class: css.headerUtilities ?? '' },
            renderSlot('conversation.session.header.utilities', {}),
          ),
        ),
        tabs.length > 1 && (
          h(
            'div',
            { class: css.tabs ?? '', role: 'tablist' },
            tabs.map(viewTab => h(
              'button',
              {
                key: viewTab.id,
                type: 'button',
                role: 'tab',
                'aria-selected': viewTab.id === active?.id,
                class: clsx(css.tab, viewTab.id === active?.id && css.tabActive),
                onclick: () => { actions.setView(viewTab.id) },
              },
              viewTab.label,
            )),
          )
        ),
      ],
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-conversation-session-header') === undefined) {
  customElements.define('freddie-conversation-session-header', FreddieConversationSessionHeader)
}

/**
 * Renders Session header chrome above the resident conversation scrollport.
 * @param props - Strict Session store, view ledger, navigation, render, and locale shares.
 * @returns the hidden blank-session header or visible title and tabs.
 */
export function ConversationSessionHeader(props) {
  const el = document.createElement('freddie-conversation-session-header')
  el.setProps(props)
  return el
}

/**
 * Strict session body custom element: subscribes to the view ledger, seeds
 * the draft mirror once per mount, and releases session images on unmount
 * (the two former mount-only effects).
 */
export class FreddieConversationSession extends HTMLElement {
  #props = null
  #unsubscribeViews = null
  #unsubscribeStore = null
  #unmirror = null
  #mirrorBoundActions = null

  setProps(props) {
    this.#props = props
    this.#syncMirror()
    this.#render()
  }

  connectedCallback() {
    if (this.#props !== null) {
      this.#unsubscribeViews = this.#props.views.subscribe(() => { this.#render() })
      // See FreddieConversationSessionHeader: useStore never re-renders on its
      // own, so the active-view content needs its own direct subscription
      // to hear actions.setView / actions.setInspect mutations.
      this.#unsubscribeStore = this.#props.subscribeStore(() => { this.#render() })
    }
    this.#syncMirror()
    this.#render()
  }

  disconnectedCallback() {
    this.#unsubscribeViews?.()
    this.#unsubscribeViews = null
    this.#unsubscribeStore?.()
    this.#unsubscribeStore = null
    this.#unmirror?.()
    this.#unmirror = null
    if (this.#props !== null) this.#props.releaseSessionImages(this.#props.sessionId)
  }

  /** Mount-only seed + mirror bind: rebinds only when `actions` identity changes
   * (mirrors the original effect's `[inputActions]` dep pin). */
  #syncMirror() {
    if (this.#props === null) return
    if (this.#props.actions !== this.#mirrorBoundActions) {
      const inputState = this.#props.useInput(s => s)
      const storedDraft = this.#props.useStore(s => s.draft)
      this.#unmirror?.()
      if (inputState.draft === '' && storedDraft !== '') this.#props.inputActions.setDraft(storedDraft)
      this.#unmirror = this.#props.bindDraftMirror(this.#props.actions.setDraft)
      this.#mirrorBoundActions = this.#props.actions
    }
  }

  #render() {
    if (this.#props === null) return
    const { sessionId, useSession, useStore, actions, renderSlot, views } = this.#props
    const tabs = views.list()
    const selectedId = useStore(s => s.view)
    const active = resolveActiveView(tabs, selectedId)
    const composerPhase = useSession(s => s.composerPhase)
    const blank = useSession(s => s.blank)
    // `?? null`: persisted snapshots from before the inspect field rehydrate without it.
    const inspect = useStore(s => s.inspect ?? null)
    void sessionId

    if (blank && composerPhase === 'blank') {
      applyDiff(this, h('div', null))
      return
    }
    const vdom = h(
      'div',
      { class: css.viewArea ?? '' },
      active !== undefined && renderSlot('conversation.view', {
        inspect,
        onInspectDone: () => { actions.setInspect(null) },
      }, { only: active.id }),
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-conversation-session') === undefined) {
  customElements.define('freddie-conversation-session', FreddieConversationSession)
}

/**
 * Renders the active Session view inside the resident scrollport and keeps
 * the input draft mirrored while blank Hero chrome is visible.
 * @param props - Strict Session input/store, view ledger, and render shares.
 * @returns the active view area, or null while the Session remains blank.
 */
export function ConversationSession(props) {
  const el = document.createElement('freddie-conversation-session')
  el.setProps(props)
  return el
}
