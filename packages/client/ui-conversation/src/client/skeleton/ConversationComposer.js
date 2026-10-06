import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { HeroShell, WorkspaceChip, workspaceLabel } from './EmptyHero.js'
import css from './ConversationRoot.css.js'
import { defineElement } from '@freddie/freddie-client-ui-primitives'

export class FreddieConversationComposer extends HTMLElement {
  #props = null
  #pickerOpen = false
  #pendingWorkspaceId
  #pickerAnchor = { current: null }

  #renderedOnce = false

  setProps(props) {
    this.#props = props
    this.#syncPendingWorkspace()
    this.#render()
  }

  connectedCallback() {
    if (this.#renderedOnce) this.#render()
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

  #render() {
    if (this.#props === null) return
    const {
      hero, sessionId, useSession, useSessions, useWorkspaces, useInput, useComposerBlock,
      renderSlot, renderSlotChain, selectWorkspace, t,
    } = this.#props

    const pending = useSession(s => s.pending) ?? []
    const session = useSession(s => s)
    const inputState = useInput(s => s)
    const cwd = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.cwd)
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

    const composer = renderSlotChain(
      'conversation.composer',
      { interactions: pending, session },
      { fallback: composerBar, overlay: true },
    )

    applyDiff(this, composer)
    this.#renderedOnce = true
  }
}

defineElement('freddie-conversation-composer', FreddieConversationComposer)

export function ConversationComposer(props) {
  const el = document.createElement('freddie-conversation-composer')
  el.setProps(props)
  return el
}
