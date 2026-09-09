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
import { applyDiff, createElement as h } from 'webjsx'
import {
  Button, IconFolderClose16, IconPlusOutline16, renderMenu,
  renderModal,
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
  // Self-mounting portal elements held across renders (see Menu.tsx/Modal.tsx doc).
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
    // One picking interaction at a time: while the flow is open (native chooser
    // pending, browse dialog up) or its pick is being adopted, every other
    // menu action stays disabled — a late outcome must not race a concurrent
    // selection or adoption.
    const flowBusy = flowOpen || pickingFolder

    // The occupied hole gates the picking affordance: with no composed flow the
    // entry simply is not there (the seam's documented no-flow default). The
    // framework-bound hook keeps occupancy live: flow plugins activate (and
    // HMR-reload) independently of this menu's renders.
    const flowAvailable = useDirectoryFlow(occupied => occupied)
    // An occupant that unloads mid-interaction leaves nobody to cancel: an
    // open flow over an already empty hole (Choose again after the occupant
    // unloaded with the error dialog up) — that transition must snap back
    // too, not just occupancy loss. Deferred to a microtask so it lands after
    // this synchronous render finishes (mirrors the original effect running
    // after commit).
    if (flowOpen && !flowAvailable) {
      this.#flowOpen = false
      queueMicrotask(() => { this.#render() })
    }
    const addEntries = flowAvailable
      ? [{ id: ADD_WORKSPACE, label: t('menu.addWorkspace'), icon: h(IconPlusOutline16, {size: 16}), disabled: flowBusy }]
      : []
    // With workspaces listed, the add action pins below the scroll region
    // (divider + always visible); otherwise it IS the menu.
    const pinAdd = !addOnly && workspaces.length > 0
    const items = pinAdd
      ? workspaces.map(workspace => ({
        id: workspace.workspaceId,
        label: workspace.title,
        icon: h(IconFolderClose16, {size: 16}),
        disabled: flowBusy,
      }))
      : addEntries
    // Nothing listed and nothing to add with (a composition that mounts this
    // package without any directory-picker): an empty popover would claim a
    // choice that does not exist, so the anchor gesture shows nothing at all.
    const menuIsEmpty = items.length === 0

    // A menu exists to disambiguate between targets. With no workspaces listed
    // and the add action the only entry left, the anchor gesture IS that action:
    // a one-row popover would cost a click and offer nothing to choose between.
    // The owner's open request is consumed the same way selecting the entry
    // would consume it (close the popover, raise the flow). An empty list is
    // only final once the baseline lands — until then the menu stays up with its
    // loading status instead of jumping into a flow the arriving list would have
    // made unnecessary; the add-only surface lists nothing and never waits.
    const listSettled = addOnly || workspaceSnapshot.phase === 'ready'
    const addIsTheOnlyEntry = !pinAdd && listSettled && addEntries.length === 1
    // `flowBusy` gates this exactly as it disables the equivalent menu entry: a
    // pick still being adopted owns the surface until it settles. Edge-triggered
    // on [open, addIsTheOnlyEntry, flowBusy] (mirrors the original useEffect's
    // deps array): re-checking the same held-true condition on every render
    // (rather than only on a value transition) re-armed this open on each
    // render the popover's own onClose synchronously caused while unwound —
    // an infinite microtask loop with no yield point, hanging the tab.
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
        /* Retrying needs an occupant to serve the flow; without one the
         * button would open a flow nobody can answer or cancel. */
        h(Button, {variant: 'primary', class: css.modalAction ?? '', disabled: !flowAvailable, onclick: () => { this.#openDirectoryFlow() }}, t('folderError.retry')),
      ],
      children: h('div', {class: css.modalError ?? '', role: 'alert'}, this.#modalError),
    })
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-workspace-pick-flow') === undefined) {
  customElements.define('freddie-workspace-pick-flow', FreddieWorkspacePickFlow)
}

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
    // Cached across renders so the flow's auto-open latch survives onClose.
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

if (typeof customElements !== 'undefined' && customElements.get('freddie-workspace-picker') === undefined) {
  customElements.define('freddie-workspace-picker', FreddieWorkspacePicker)
}

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
