import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import css from './ConversationRoot.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

const DEFAULT_VIEW_ID = 'chat'

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

defineElement('freddie-conversation-session-header', FreddieConversationSessionHeader)

export function ConversationSessionHeader(props) {
  const el = document.createElement('freddie-conversation-session-header')
  el.setProps(props)
  return el
}

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
    this.#mirrorBoundActions = null
    if (this.#props !== null) this.#props.releaseSessionImages(this.#props.sessionId)
  }

  #syncMirror() {
    if (this.#props === null || !this.isConnected) return
    if (this.#props.actions !== this.#mirrorBoundActions || this.#unmirror === null) {
      this.#unmirror?.()
      this.#unmirror = this.#props.bindDraftMirror()
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

defineElement('freddie-conversation-session', FreddieConversationSession)

export function ConversationSession(props) {
  const el = document.createElement('freddie-conversation-session')
  el.setProps(props)
  return el
}
