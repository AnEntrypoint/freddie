/**
 * Workspace pick/add flow. WorkspacePickFlow is the reusable core (menu +
 * path error dialog) consumed directly by WorkspaceBrowser (same package) and
 * wrapped by WorkspacePicker for the conversation empty-state slot
 * registration. Directory picking itself lives in the composed flow package's
 * slot occupant (see the contract module doc): this core only opens the flow,
 * adopts the picked path, and owns the error surface. Adding a workspace has
 * exactly one route — pick a host directory, new or existing — because the
 * occupant's own create-folder affordance already covers creating one.
 */
import { applyDiff, createElement as h } from '@freddie/webjsx'
import {
  Button, IconFolderClose16, IconPlusOutline16, renderMenu,
  renderModal,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import css from './WorkspacePicker.css.js'

const ADD_WORKSPACE = '::add-workspace'

/**
 * Pick menu plus the adoption error dialog, as a webjsx custom element.
 * Converted from a React hooks component: every useState becomes a private
 * field, useCallback identities are irrelevant (no memoized child tree to
 * preserve), and the two useEffect bodies become explicit comparisons inside
 * `#render()` — the framework's standard selector hooks (`useWorkspaces`,
 * `useDirectoryFlow`) are called directly from `#render()`, matching
 * ui-conversation's FreddieChatView established convention for webjsx elements
 * consuming the standard-kit hooks.
 */
export class FreddieWorkspacePickFlow extends HTMLElement {
  #props = null
  #errorOpen = false
  #modalError = null
  #flowOpen = false
  #pickingFolder = false
  /** Edge-trigger latch for the addIsTheOnlyEntry auto-open (was a useEffect deps array). */
  #autoOpenArmedFor = null
  #menu = null
  #errorModal = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #getAnchorRect = () => this.#props?.anchorRef?.current?.getBoundingClientRect() ?? null

  #closeModal() {
    this.#errorOpen = false
    this.#modalError = null
    this.#render()
  }

  /** Adopt a picked directory; failures land in the folder-error dialog (Choose again reopens the flow). */
  #adoptDirectory(path) {
    const props = this.#props
    if (props === null) return Promise.resolve()
    return props.createWorkspace({ path }).then((workspace) => {
      this.#flowOpen = false
      this.#render()
      props.onPick(workspace.workspaceId)
    }).catch((reason) => {
      this.#modalError = reason instanceof Error ? reason.message : String(reason)
      this.#flowOpen = false
      this.#errorOpen = true
      this.#render()
    })
  }

  #openDirectoryFlow() {
    const props = this.#props
    if (props === null) return
    props.onClose()
    this.#errorOpen = false
    this.#modalError = null
    this.#flowOpen = true
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const {
      t, open, useWorkspaces, useDirectoryFlow, renderDirectoryFlow, onPick, onClose,
      addOnly = false, side = 'bottom', selectedId,
    } = props

    const workspaceSnapshot = useWorkspaces(state => state)
    const workspaces = workspaceSnapshot.items
    const flowOpen = this.#flowOpen
    const pickingFolder = this.#pickingFolder
    const flowBusy = flowOpen || pickingFolder

    const flowAvailable = useDirectoryFlow(occupied => occupied)
    if (flowOpen && !flowAvailable) {
      this.#flowOpen = false
      queueMicrotask(() => { this.#render() })
    }
    const addEntries = flowAvailable
      ? [{ id: ADD_WORKSPACE, label: t('menu.addWorkspace'), icon: h(IconPlusOutline16, {size: 16}), disabled: flowBusy }]
      : []
    const pinAdd = !addOnly && workspaces.length > 0
    const items = pinAdd
      ? workspaces.map(workspace => ({
        id: workspace.workspaceId,
        label: workspace.title,
        icon: h(IconFolderClose16, {size: 16}),
        disabled: flowBusy,
      }))
      : addEntries
    const menuIsEmpty = items.length === 0

    const listSettled = addOnly || workspaceSnapshot.phase === 'ready'
    const addIsTheOnlyEntry = !pinAdd && listSettled && addEntries.length === 1
    const autoOpenKey = { open, addIsTheOnlyEntry, flowBusy }
    const autoOpenChanged = this.#autoOpenArmedFor === null
      || this.#autoOpenArmedFor.open !== autoOpenKey.open
      || this.#autoOpenArmedFor.addIsTheOnlyEntry !== autoOpenKey.addIsTheOnlyEntry
      || this.#autoOpenArmedFor.flowBusy !== autoOpenKey.flowBusy
    if (autoOpenChanged) {
      this.#autoOpenArmedFor = autoOpenKey
      if (open && addIsTheOnlyEntry && !flowBusy) {
        queueMicrotask(() => { this.#openDirectoryFlow() })
      }
    }

    /** Owner side of the flow conversation: adopt keeps the flow open (busy) until the Host answers. */
    const flowOwner = {
      open: flowOpen,
      busy: pickingFolder,
      onPicked: (path) => {
        this.#pickingFolder = true
        this.#render()
        void this.#adoptDirectory(path).finally(() => { this.#pickingFolder = false; this.#render() })
      },
      onCancel: () => { this.#flowOpen = false; this.#render() },
      onError: (message) => {
        this.#flowOpen = false
        this.#modalError = message
        this.#errorOpen = true
        this.#render()
      },
    }

    const handleSelect = (id) => {
      if (id === ADD_WORKSPACE) {
        this.#openDirectoryFlow()
        return
      }
      onPick(id)
    }

    const directoryFlowNode = renderDirectoryFlow(flowOwner)
    const statusNode = open && !addIsTheOnlyEntry && !menuIsEmpty && workspaceSnapshot.phase === 'pending'
      ? h('div', {class: css.menuStatus ?? '', role: 'status'}, t('picker.loading'))
      : null
    const vdom = [
      ...(statusNode === null ? [] : [statusNode]),
      ...(directoryFlowNode === null ? [] : [directoryFlowNode]),
    ]
    applyDiff(this, vdom)

    this.#menu = renderMenu(this.#menu, {
      open: open && !addIsTheOnlyEntry && !menuIsEmpty,
      anchor: '',
      items,
      ...(pinAdd ? { footer: addEntries } : {}),
      selectedId,
      onSelect: handleSelect,
      onClose,
      side,
      portal: true,
      getAnchorRect: this.#getAnchorRect,
    })

    this.#errorModal = renderModal(this.#errorModal, {
      open: this.#errorOpen,
      onClose: () => { this.#closeModal() },
      closeLabel: t('close'),
      title: t('folderError.title'),
      footer: [
        h(Button, {variant: 'outline', class: css.modalAction ?? '', onclick: () => { this.#closeModal() }}, t('cancel')),
        h(Button, {variant: 'primary', class: css.modalAction ?? '', disabled: !flowAvailable, onclick: () => { this.#openDirectoryFlow() }}, t('folderError.retry')),
      ],
      children: h('div', {class: css.modalError ?? '', role: 'alert'}, this.#modalError),
    })
  }
}

defineElement('freddie-workspace-pick-flow', FreddieWorkspacePickFlow)

/**
 * @typedef {object} WorkspacePickFlowProps
 * @property {function(string, object=): string} t - conversation locale seat.
 * @property {boolean} open - whether the pick menu is open.
 * @property {{current: Element|null}} anchorRef - element the pick menu and error modal anchor to.
 * @property {function(function(object): object): object} useWorkspaces - workspace-store selector hook; called with an identity selector, returns `{items: Array<{workspaceId: string, title: string}>, phase: 'pending'|'ready'|string}`.
 * @property {function({path: string}): Promise<{workspaceId: string}>} createWorkspace - adopts a picked host directory as a workspace.
 * @property {function(function(boolean): boolean): boolean} useDirectoryFlow - reports whether the directory-flow slot occupant is available.
 * @property {function(object): (Node|null)} renderDirectoryFlow - renders the composed directory-picking flow for the given flow-owner share.
 * @property {string} [selectedId] - the menu item to show selected.
 * @property {function(string): void} onPick - called with the chosen workspace id.
 * @property {function(): void} onClose - called to close the pick menu.
 * @property {boolean} [addOnly=false] - when true, the menu shows only the add-workspace entry.
 * @property {string} [side='bottom'] - the menu's anchor side.
 */

/**
 * Create (if needed) or update a WorkspacePickFlow element in place.
 * @param el - an existing `freddie-workspace-pick-flow` element to update, or null to create one.
 * @param props - see {@link WorkspacePickFlowProps}.
 * @returns the `freddie-workspace-pick-flow` element; keep it and pass it back in to update.
 */
export function renderWorkspacePickFlow(el, props) {
  const target = el ?? document.createElement('freddie-workspace-pick-flow')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function WorkspacePickFlow(props) {
  return renderWorkspacePickFlow(null, props)
}

/**
 * The conversation empty-state registration: adapts the owner share to the
 * core flow (all state and semantics live in the flow / the owner). Converted
 * to a webjsx custom element wrapping {@link FreddieWorkspacePickFlow}, since it
 * only reads props and creates no local state — a thin bridge, same shape as
 * ui-primitives' one-shot creation helpers.
 */
export class FreddieWorkspacePicker extends HTMLElement {
  #props = null
  #pickFlow = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const {
      open, anchorRef, useWorkspaces, selectedId, onPick, onClose, createWorkspace, useDirectoryFlow, renderSlot, t,
    } = props
    this.#pickFlow = renderWorkspacePickFlow(this.#pickFlow, {
      t,
      open,
      anchorRef,
      useWorkspaces,
      createWorkspace,
      useDirectoryFlow,
      renderDirectoryFlow: owner => renderSlot('conversation.hero.workspace.directoryFlow', owner),
      selectedId,
      onPick,
      onClose,
    })
    applyDiff(this, [this.#pickFlow])
  }
}

defineElement('freddie-workspace-picker', FreddieWorkspacePicker)

/**
 * @typedef {object} WorkspacePickerProps
 * @property {boolean} open - whether the pick menu is open.
 * @property {{current: Element|null}} anchorRef - element the pick menu and error modal anchor to.
 * @property {function(function(object): object): object} useWorkspaces - workspace-store selector hook; forwarded to {@link WorkspacePickFlowProps}.
 * @property {string} [selectedId] - the menu item to show selected.
 * @property {function(string): void} onPick - called with the chosen workspace id.
 * @property {function(): void} onClose - called to close the pick menu.
 * @property {function({path: string}): Promise<{workspaceId: string}>} createWorkspace - adopts a picked host directory as a workspace.
 * @property {function(function(boolean): boolean): boolean} useDirectoryFlow - reports whether the directory-flow slot occupant is available.
 * @property {function(string, object): (Node|null)} renderSlot - renders the named contract slot's registered occupant with the given owner share.
 * @property {function(string, object=): string} t - conversation locale seat.
 */

/**
 * Create (if needed) or update a WorkspacePicker element in place.
 * @param el - an existing `freddie-workspace-picker` element to update, or null to create one.
 * @param props - see {@link WorkspacePickerProps}.
 * @returns the `freddie-workspace-picker` element; keep it and pass it back in to update.
 */
export function renderWorkspacePicker(el, props) {
  const target = el ?? document.createElement('freddie-workspace-picker')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function WorkspacePicker(props) {
  return renderWorkspacePicker(null, props)
}
