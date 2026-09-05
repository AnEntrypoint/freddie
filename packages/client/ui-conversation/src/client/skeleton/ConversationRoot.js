// Resident conversation skeleton. Hero chrome, composer positioning, the
// chain, AND the composer bar (session-maybe slot) stay mounted across
// no-session/session transitions — the bar renders inert via owner props.
//
// Converted from a React hooks component to a webjsx custom element:
// pickerOpen/pendingWorkspaceId become instance fields, the seat-resize
// callback ref becomes an explicit ResizeObserver bound after render (the
// seat element is looked up by its data attribute since applyDiff owns node
// identity), and the pending-workspace-clear effect becomes an explicit sync
// call inside #render. Re-render is an explicit applyDiff(this, vdom) call
// (Toast.tsx's pattern).

import { applyDiff, createElement as h } from 'webjsx'
import clsx from 'clsx'
import { HeroShell, WorkspaceChip, workspaceLabel } from './EmptyHero.js'
import css from './ConversationRoot.css.js'

export class FreddieConversationRoot extends HTMLElement {
  #props = null
  #pickerOpen = false
  #pendingWorkspaceId
  #pickerAnchor = { current: null }
  #seatObserver = null
  #seatEl = null

  // ConversationRoot() (the one-shot creation helper below) calls setProps()
  // synchronously right after document.createElement, i.e. BEFORE this
  // element is inserted into the document — connectedCallback fires only
  // once insertion actually lands. Rendering unconditionally in both places
  // double-renders the very first mount around that detach/attach boundary:
  // webjsx's per-element diff cache (element.__webjsx_childNodes) desyncs
  // from the live DOM across the two back-to-back applyDiff(this, vdom)
  // calls, and the second render's stale "one child" bookkeeping leaves an
  // orphaned extra `[data-slot]` subtree instead of reusing/removing the
  // first render's — the observed duplicate composer / duplicate hero
  // content. Skipping the redundant connectedCallback render on first mount
  // (setProps already rendered everything it would produce) removes the
  // double-render window entirely; every later re-render (setProps updates)
  // is untouched.
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

  /** Clear the pending pick once the session lands in it, or when the picked
   * workspace disappears from a ready list (deleted from the sidebar). */
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

  /** Bind (or rebind) the composer-seat height observer once the seat element
   * is in the DOM. Mirrors the former callback-ref: disconnect-then-observe
   * on identity change, no-op when the element is unchanged. */
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
    // A plugin this package cannot import (ui-model-selection) says this session cannot
    // send; its reason is already localized by whoever raised it.
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

    // While a session is still replaying (loading + blank) the hero/docked
    // choice is unknowable — render the composer hidden instead of flashing
    // the centered hero and snapping to the docked bar (or vice versa).
    // Exemption: a session the list summary already proves blank can only
    // land on the hero, so hiding would blank the column for the whole
    // history round-trip (the startup auto-selection flash) for nothing.
    // The exemption is deliberately open-state-wide, not loading-only: a
    // summary-blank session is the hero before its open starts (`cold`) and
    // after one fails (`error`) for the same reason — there is no history.
    const settling = sessionId !== undefined && composerPhase === 'blank' && openState === 'loading'
      && summaryBlank !== true
    const hero = sessionId === undefined
      || (composerPhase === 'blank' && (openState === 'open' || summaryBlank === true))
    const zone =
      session === undefined || inputState === undefined ? undefined : { session, input: inputState }

    // The chip is a selector; label resolution walks the flow top-down:
    //   1. a just-picked workspace (pending) → its title;
    //   2. cold start, no session yet → placeholder ("Choose workspace");
    //   3. the blank session's workspace is in the list → its title;
    //   4. list still loading → cwd folder name bridges so the title does not
    //      flash on refresh (empty cwd → placeholder);
    //   5. list ready but no owning workspace (deleted from the sidebar) →
    //      placeholder, never the deleted folder's name via cwd.
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

    // The placeholder chip ("Choose workspace") and the Workspace-trigger input travel
    // together: no workspace picked yet (cold start, no session at all), or a
    // blank session whose workspace vanished (deleted from the sidebar). The
    // bar is ONE session-maybe slot rendered unconditionally — inert is a prop,
    // not a different tree, so the textarea DOM survives the transition.
    const inert = sessionId === undefined || (hero && chipTitle === undefined)
    // A raised block is the same inert posture with the blocker's own reason:
    // one disabled textarea, never a second tree. The no-workspace state wins
    // when both hold — picking a workspace is the earlier prerequisite.
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
          // `blocked`, not `disabled`: the bar refuses input either way, but a
          // block keeps the model seat live because choosing a model is how the
          // user clears it.
          ? { blocked: composerBlock, placeholder: composerBlock.reason }
          : hero ? { placeholder: t('placeholder.hero') } : {}),
      overlay: renderSlot('conversation.input.overlay', {}),
      leftItems: zone === undefined ? null : renderSlot('conversation.input.left', zone),
      rightItems: zone === undefined ? null : renderSlot('conversation.input.right', zone),
      // Stats band under the card, inside the bar's width column so both
      // share one constraint (composer.dock = stats-line family).
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

    // Sticky wraps the whole chain output (fallback + elected overlay), not
    // only `.composerStack`: overlay:true renders those as siblings, and sticky
    // on the fallback alone would leave Question/Approval panels at the content
    // end off-screen when the user is not pinned to the floor.
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-conversation-root') === undefined) {
  customElements.define('freddie-conversation-root', FreddieConversationRoot)
}

/** One-shot creation/update helper preserving the original function-component call shape. */
export function ConversationRoot(props) {
  const el = document.createElement('freddie-conversation-root')
  el.setProps(props)
  return el
}
