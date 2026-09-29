import { applyDiff, createElement as h } from '@freddie/webjsx'
import {
  Button, IconFolderClose16, IconPlusOutline16, renderMenu,
  renderModal,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import css from './WorkspacePicker.css.js'

const ADD_WORKSPACE = '::add-workspace'

export class FreddieWorkspacePickFlow extends HTMLElement {
  #props = null
  #errorOpen = false
  #modalError = null
  #flowOpen = false
  #pickingFolder = false
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

export function renderWorkspacePickFlow(el, props) {
  const target = el ?? document.createElement('freddie-workspace-pick-flow')
  target.setProps(props)
  return target
}

export function WorkspacePickFlow(props) {
  return renderWorkspacePickFlow(null, props)
}

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

export function renderWorkspacePicker(el, props) {
  const target = el ?? document.createElement('freddie-workspace-picker')
  target.setProps(props)
  return target
}

export function WorkspacePicker(props) {
  return renderWorkspacePicker(null, props)
}
