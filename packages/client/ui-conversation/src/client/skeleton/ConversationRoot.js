import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { HeroShell, WorkspaceChip, workspaceLabel } from './EmptyHero.js'
import css from './ConversationRoot.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

export class FreddieConversationRoot extends HTMLElement {
  #props = null
  #pickerOpen = false
  #pendingWorkspaceId
  #pickerAnchor = { current: null }
  #seatObserver = null
  #seatEl = null

  #renderedOnce = false

  setProps(props) {
    this.#props = props
    this.#syncPendingWorkspace()
    this.#render()
  }

  connectedCallback() {
    if (this.#renderedOnce) this.#render()
  }

  disconnectedCallback() {
    this.#seatObserver?.disconnect()
    this.#seatObserver = null
  }

  #syncPendingWorkspace() {
    if (this.#props === null || this.#pendingWorkspaceId === undefined) return
    const { sessionId, useWorkspaces } = this.#props
    const workspaces = useWorkspaces(s => s)
    const sessionWorkspace = sessionId === undefined
      ? undefined
      : workspaces.items.find(workspace => workspace.sessionIds.includes(sessionId))
    const pendingWorkspace = workspaces.items.find(
      workspace => workspace.workspaceId === this.#pendingWorkspaceId,
    )
    if (sessionWorkspace?.workspaceId === this.#pendingWorkspaceId
      || (workspaces.phase === 'ready' && pendingWorkspace === undefined)) {
      this.#pendingWorkspaceId = undefined
    }
  }

  #bindSeatObserver() {
    const seat = this.querySelector('[data-composer-seat]')
    if (seat === this.#seatEl) return
    this.#seatObserver?.disconnect()
    this.#seatObserver = null
    this.#seatEl = seat
    const scroller = seat?.parentElement ?? null
    if (seat === null || scroller === null) return
    this.#seatObserver = new ResizeObserver(() => {
      scroller.style.setProperty('--freddie-composer-height', `${seat.offsetHeight}px`)
    })
    this.#seatObserver.observe(seat)
  }

  #render() {
    if (this.#props === null) return
    const {
      sessionId, useSession, useSessions, useWorkspaces, useInput, useComposerBlock,
      renderSlot, renderSlotChain, selectWorkspace, t,
    } = this.#props

    const openState = useSession(s => s.openState)
    const composerPhase = useSession(s => s.composerPhase)
    const pending = useSession(s => s.pending) ?? []
    const session = useSession(s => s)
    const inputState = useInput(s => s)
    const cwd = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.cwd)
    const summaryBlank = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.blank)
    const workspaces = useWorkspaces(s => s)
    const composerBlock = useComposerBlock(block => block)

    const pickerOpen = this.#pickerOpen
    const pendingWorkspaceId = this.#pendingWorkspaceId
    const pickerAnchor = this.#pickerAnchor

    const sessionWorkspace = sessionId === undefined
      ? undefined
      : workspaces.items.find(workspace => workspace.sessionIds.includes(sessionId))
    const pendingWorkspace = workspaces.items.find(
      workspace => workspace.workspaceId === pendingWorkspaceId,
    )

    const settling = sessionId !== undefined && composerPhase === 'blank' && openState === 'loading'
      && summaryBlank !== true
    const hero = sessionId === undefined
      || (composerPhase === 'blank' && (openState === 'open' || summaryBlank === true))
    const zone =
      session === undefined || inputState === undefined ? undefined : { session, input: inputState }

    const chipTitle = pendingWorkspace?.title
      ?? (sessionId === undefined
        ? undefined
        : sessionWorkspace?.title
          ?? (workspaces.phase === 'ready' || cwd === undefined || cwd === ''
            ? undefined
            : workspaceLabel(cwd)))

    const heroWorkspaceRow = h(
      'div',
      { class: css.heroWorkspaceRow ?? '' },
      WorkspaceChip({
        buttonRef: pickerAnchor,
        label: chipTitle,
        menuOpen: pickerOpen,
        onClick: () => { this.#pickerOpen = !this.#pickerOpen; this.#render() },
        t,
      }),
      renderSlot('conversation.hero.workspace', {
        open: pickerOpen,
        anchorRef: pickerAnchor,
        selectedId: pendingWorkspaceId ?? sessionWorkspace?.workspaceId,
        onPick: (workspaceId) => {
          this.#pickerOpen = false
          this.#pendingWorkspaceId = workspaceId
          this.#render()
          void selectWorkspace(workspaceId).catch(() => {
            if (this.#pendingWorkspaceId === workspaceId) this.#pendingWorkspaceId = undefined
            this.#render()
          })
        },
        onClose: () => { this.#pickerOpen = false; this.#render() },
      }),
      renderSlot('conversation.hero.agentPreset', {}),
    )

    const inert = sessionId === undefined || (hero && chipTitle === undefined)
    const blocked = !inert && composerBlock !== undefined
    const inputBar = renderSlot('conversation.composer.bar', {
      variant: hero ? 'hero' : 'composer',
      ...(inert
        ? {
          disabled: true,
          placeholder: t('placeholder.workspace'),
          workspacePickerOpen: pickerOpen,
          onRequestWorkspace: () => { this.#pickerOpen = true; this.#render() },
        }
        : blocked
          ? { blocked: composerBlock, placeholder: composerBlock.reason }
          : hero ? { placeholder: t('placeholder.hero') } : {}),
      overlay: renderSlot('conversation.input.overlay', {}),
      leftItems: zone === undefined ? null : renderSlot('conversation.input.left', zone),
      rightItems: zone === undefined ? null : renderSlot('conversation.input.right', zone),
      footer: !hero && zone !== undefined ? renderSlot('conversation.composer.dock', zone) : null,
    })

    const composerBar = h(
      'div',
      { class: clsx(css.composerStack, hero && css.composerHero) },
      hero && HeroShell({}),
      hero && heroWorkspaceRow,
      zone !== undefined && renderSlot('conversation.input.dock', zone),
      inputBar,
    )

    const phase = settling ? 'settling' : hero ? 'hero' : 'active'
    const composer = renderSlotChain(
      'conversation.composer',
      { interactions: pending, session },
      { fallback: composerBar, overlay: true },
    )

    const composerSeat = h(
      'div',
      { class: css.composerSeat ?? '', 'data-composer-seat': '' },
      composer,
    )

    const vdom = h(
      'div',
      { class: css.root ?? '', 'data-phase': phase },
      renderSlot('conversation.session.header', {}),
      h(
        'div',
        { class: css.scrollBody ?? '', 'data-conversation-scroll': '' },
        renderSlot('conversation.session', {}),
        composerSeat,
      ),
    )
    applyDiff(this, vdom)
    this.#bindSeatObserver()
    this.#renderedOnce = true
  }
}

defineElement('freddie-conversation-root', FreddieConversationRoot)

export function ConversationRoot(props) {
  const el = document.createElement('freddie-conversation-root')
  el.setProps(props)
  return el
}
