/**
 * Permission preference row: the default preset for subsequently created
 * sessions. Current-session switches remain on the composer `/permission`
 * control.
 *
 * Converted from a React hooks component to a webjsx custom element:
 * open/confirmingFullAccess/acknowledged state become instance fields, the
 * settings-status-driven effect becomes logic inside `#derive`/`#render`, and
 * re-render is an explicit applyDiff(this, vdom) call (Toast.tsx's pattern).
 */
import { applyDiff, createElement as h } from 'webjsx'
import {
  IconChevronDownOutline14, renderMenu, renderRiskConfirmation,
} from '@freddie/freddie-client-ui-primitives'
import { FULL_ACCESS_PRESET } from './presentation.js'
import css from './PermissionRow.css.js'

/**
 * Render the new-session Permission default selector.
 */
export class FreddiePermissionRow extends HTMLElement {
  #props = null
  #open = false
  #confirmingFullAccess = false
  #acknowledged = false
  #lastWritable = null
  #lastStatus = null
  #loaded = false
  // Held across renders (renderMenu(this.#menu, ...) / renderRiskConfirmation
  // (this.#confirmModal, ...)) instead of the bare Menu(...)/RiskConfirmation
  // (...) one-shot calls: those always create a brand-new freddie-menu/freddie-modal,
  // so calling them fresh on every #render() replaced the live element (and
  // its bound listeners) — or, for the modal, orphaned a fresh freddie-modal
  // onto document.body — on every state change.
  #menu = null
  #confirmModal = null

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    this.#props = props
    if (!this.#loaded) {
      this.#loaded = true
      void props.load()
    }
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {}

  #render() {
    const props = this.#props
    if (props === null) { applyDiff(this, []); return }
    const { select, t, usePermission } = props
    // NOTE: usePermission is the framework standard-kit's React-hook binding
    // (InjectFace synthesizes it from the registered SnapshotStore); this
    // custom element calls it outside a React render as a best-effort bridge
    // — the raw observable itself is not threaded onto composed props. See
    // batch report: cross-package blocker in ui-slots/ui-renderer, out of
    // this package's scope.
    const state = usePermission(snapshot => snapshot)

    if (state.writable && state.status !== 'unavailable') {
      // no-op: keep current open/confirm state
    } else if (this.#lastWritable !== state.writable || this.#lastStatus !== state.status) {
      this.#open = false
      this.#acknowledged = false
      this.#confirmingFullAccess = false
    }
    this.#lastWritable = state.writable
    this.#lastStatus = state.status

    if (state.status === 'unavailable') { applyDiff(this, []); return }
    const selected = state.options.find(option => option.id === state.currentValue)
    const busy = state.status === 'loading' || state.status === 'saving' || this.#confirmingFullAccess
    const label = selected?.label
      ?? (busy ? t('loading') : t('unavailable'))
    const description = state.error ?? t('description')

    const vdom = [
      h('div', {class: css.row ?? ''},
        h('div', {class: css.rowText ?? ''},
          h('div', {class: css.title ?? ''}, t('title')),
          h('div', {class: css.desc ?? '', role: state.error === null ? null : 'alert'}, description),
        ),
        (() => {
          this.#menu = renderMenu(this.#menu, {
            open: this.#open,
            onClose: () => { this.#open = false; this.#render() },
            items: state.options.map(option => ({ id: option.id, label: option.label })),
            selectedId: state.currentValue,
            onSelect: (id) => {
              this.#open = false
              if (id === state.currentValue) { this.#render(); return }
              if (id === FULL_ACCESS_PRESET) {
                this.#acknowledged = false
                this.#confirmingFullAccess = true
                this.#render()
                return
              }
              this.#render()
              void select(id)
            },
            align: 'end',
            portal: true,
            anchor: (
              h('button', {
                type: 'button',
                class: css.selector ?? '',
                'aria-haspopup': 'menu',
                'aria-expanded': this.#open,
                disabled: busy || !state.writable || state.options.length === 0,
                onclick: () => { this.#open = !this.#open; this.#render() },
              },
                label,
                h(IconChevronDownOutline14, {className: css.chevron}),
              )
            ),
          })
          return this.#menu
        })(),
      ),
    ]
    this.#confirmModal = renderRiskConfirmation(this.#confirmModal, {
      open: this.#confirmingFullAccess,
      title: t('confirm.title'),
      description: t('confirm.description'),
      acknowledgeLabel: t('confirm.acknowledge'),
      cancelLabel: t('confirm.cancel'),
      confirmLabel: t('confirm.enable'),
      acknowledged: this.#acknowledged,
      disabled: !state.writable || state.status === 'saving',
      onAcknowledgedChange: (acknowledged) => { this.#acknowledged = acknowledged; this.#render() },
      onCancel: () => {
        this.#acknowledged = false
        this.#confirmingFullAccess = false
        this.#render()
      },
      onConfirm: () => {
        this.#acknowledged = false
        this.#confirmingFullAccess = false
        this.#render()
        void select(FULL_ACCESS_PRESET)
      },
    })
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-permission-row') === undefined) {
  customElements.define('freddie-permission-row', FreddiePermissionRow)
}

/** One-shot creation helper preserving the original function-component call shape. */
export function PermissionRow(props) {
  const el = document.createElement('freddie-permission-row')
  el.setProps(props)
  return el
}
