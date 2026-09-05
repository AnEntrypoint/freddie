// Converted from a React hooks component to a webjsx custom element:
// pick/open/confirmation/acknowledged become instance fields, the
// lock-reset effect becomes an explicit sync call inside setProps, and
// re-render is an explicit applyDiff(this, vdom) call (Toast.tsx's pattern).

import { applyDiff, createElement as h } from 'webjsx'
import clsx from 'clsx'
import { IconChevronDownOutline14, renderMenu, renderRiskConfirmation } from '@freddie/freddie-client-ui-primitives'
import css from './PermissionSelect.css.js'

const FULL_ACCESS = 'danger-full-access'

/* Shield glyphs (design set 1556): check = read-only, pencil = workspace
   write, exclamation = full access. currentColor so the trigger and menu
   rows tint them with their own text color. */

const shieldOutline = 'M8.20554 0.899994L14.7901 3.36857V7.01026C14.7901 12 11.0466 14.2103 8.20554 15.3C5.36446 14.2103 1.62012 12 1.62012 7.01026V3.36857L8.20554 0.899994Z'

function shieldGlyph(kind) {
  if (kind === 'read-only') {
    return h(
      'svg',
      { width: '16', height: '16', viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
      h('path', { d: shieldOutline, stroke: 'currentColor', 'stroke-width': '1.31831', 'stroke-linejoin': 'round' }),
      h('path', {
        d: 'M12.1654 5.7552L8.9447 9.41475C8.73044 9.65816 8.53628 9.8804 8.35774 10.0423C8.1713 10.2114 7.94235 10.3717 7.64016 10.4254C7.48207 10.4535 7.32 10.4552 7.16151 10.4294C6.85843 10.3801 6.62728 10.2223 6.43836 10.0559C6.25752 9.89653 6.06037 9.67732 5.84264 9.43705L4.72925 8.20897L5.63557 7.38707L6.74897 8.61594C6.98603 8.87755 7.12974 9.03533 7.24673 9.13839C7.31033 9.19443 7.34485 9.21476 7.35823 9.22122C7.38068 9.22484 7.40352 9.22515 7.42593 9.22122C7.40522 9.22502 7.42893 9.23294 7.53583 9.136C7.65132 9.03126 7.79316 8.87139 8.02643 8.60638L11.2479 4.94763L12.1654 5.7552Z',
        fill: 'currentColor',
      }),
    )
  }
  if (kind === 'workspace-write') {
    return h(
      'svg',
      { width: '16', height: '16', viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
      h('path', {
        d: 'M8.08887 0.251709C8.20479 0.23085 8.32486 0.241168 8.43652 0.282959L15.0215 2.75171C15.2787 2.84819 15.4492 3.09414 15.4492 3.3689V7.0105C15.4492 7.10986 15.4441 7.2081 15.4414 7.30542C15.0285 7.07175 14.5905 6.87695 14.1309 6.73022V3.82495L8.20508 1.60327L2.2793 3.82495V7.0105C2.27936 9.7171 3.4745 11.5379 5.02734 12.7947C5.01025 12.9942 5 13.1962 5 13.4001C5.00001 13.7617 5.02722 14.1169 5.08008 14.4636C2.91555 13.0393 0.961014 10.752 0.960938 7.0105V3.3689C0.960938 3.09417 1.13146 2.84821 1.38867 2.75171L7.97461 0.282959L8.08887 0.251709Z',
        fill: 'currentColor',
      }),
      h('path', { d: 'M11.3525 5.64688V6.85688H5V5.64688H11.3525Z', fill: 'currentColor' }),
      h('path', { d: 'M9.5824 8.29376V9.50376H5V8.29376H9.5824Z', fill: 'currentColor' }),
      h('path', {
        d: 'M14.6647 15.6852H10.0338C10.3878 15.3751 10.7567 15.0517 11.0772 14.7706C11.2531 14.6164 11.4144 14.4746 11.5511 14.3547H14.6647V15.6852Z',
        fill: 'currentColor',
      }),
      h('path', {
        d: 'M8.14852 14.1308L7.33925 15.4976C7.22458 15.6912 7.42245 15.9194 7.63037 15.8333L9.09785 15.2254L15.0399 10.0719L14.0905 8.97733L8.14852 14.1308Z',
        fill: 'currentColor',
      }),
    )
  }
  return h(
    'svg',
    { width: '16', height: '16', viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
    h('path', { d: shieldOutline, stroke: 'currentColor', 'stroke-width': '1.31831', 'stroke-linejoin': 'round' }),
    h('path', { d: 'M9.10094 4.5V8.75939H7.59888V4.5H9.10094Z', fill: 'currentColor' }),
    h('path', { d: 'M9.10094 9.8114V11.5H7.59888V9.8114H9.10094Z', fill: 'currentColor' }),
  )
}

/** Glyph for a permission option value; host-configured names outside the design set get none. */
function permissionGlyph(value) {
  if (value === 'read-only') return shieldGlyph('read-only')
  if (value === 'workspace-write') return shieldGlyph('workspace-write')
  if (value === FULL_ACCESS) return shieldGlyph('full-access')
  return undefined
}

/**
 * Display transform: kebab-case machine names render as title-case labels
 * (`workspace-write` → `Workspace Write`); non-kebab host-configured names
 * pass through. Full access intentionally overrides the machine-name
 * transform so both permission surfaces use the product label `Full access`;
 * the warning body remains locale-aware.
 */
function displayName(name) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function optionLabel(option) {
  return option.value === FULL_ACCESS ? 'Full access' : displayName(option.name)
}

export class FreddiePermissionSelect extends HTMLElement {
  #props = null
  #pick = null
  #open = false
  #confirmation = null
  #acknowledged = false
  // Held across renders and updated via renderMenu(this.#menu, ...) rather
  // than the bare Menu(...) one-shot helper: Menu(...) always creates and
  // returns a brand-new freddie-menu element, so calling it fresh on every
  // #render() replaced the whole custom element (and its bound click
  // listeners) on every state change instead of updating the existing one
  // in place — see Menu.tsx's own renderMenu/Menu split and the same
  // pattern already used by renderPresetMenu, DirectoryBrowser, JsonTree.
  #menu = null
  // Same fix, same reason, for the confirmation dialog: held and updated via
  // renderRiskConfirmation(this.#confirmModal, ...) instead of the bare
  // <RiskConfirmation ... /> JSX call, which recreated the underlying
  // freddie-modal (and orphaned the previous one onto document.body) on every
  // #render() — including the very #render() that opens it.
  #confirmModal = null

  setProps(props) {
    const prevLocked = this.#props?.locked
    const prevValue = this.#props?.value
    this.#props = props
    if (props.locked !== prevLocked || props.value !== prevValue) {
      if (!props.locked && props.value !== undefined) {
        // unchanged
      } else {
        this.#open = false
        this.#acknowledged = false
        this.#confirmation = null
      }
    }
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #submit(id) {
    if (this.#props === null) return
    this.#pick = id
    this.#render()
    void this.#props.command(`/permission ${id}`)
      .catch(() => false)
      .then(() => { this.#pick = null; this.#render() })
  }

  #choose(id) {
    if (this.#props === null) return
    this.#open = false
    if (id === this.#props.value?.currentValue) { this.#render(); return }
    if (id === FULL_ACCESS) {
      this.#acknowledged = false
      this.#confirmation = id
      this.#render()
      return
    }
    this.#submit(id)
  }

  #closeConfirmation() {
    this.#acknowledged = false
    this.#confirmation = null
    this.#render()
  }

  #confirmFullAccess() {
    if (this.#props === null || this.#props.locked || !this.#acknowledged || this.#confirmation === null) return
    const id = this.#confirmation
    this.#acknowledged = false
    this.#confirmation = null
    this.#submit(id)
  }

  #render() {
    if (this.#props === null) return
    const { value, locked, t } = this.#props
    if (value === undefined) {
      applyDiff(this, h('span', null))
      return
    }
    const pick = this.#pick
    const open = this.#open
    const confirmation = this.#confirmation
    const acknowledged = this.#acknowledged

    const currentValue = pick ?? value.currentValue
    const current = value.options.find(option => option.value === currentValue)
    const busy = pick !== null || confirmation !== null

    const items = value.options
      .filter(o => o.value !== 'custom')
      .map((option) => {
        const icon = permissionGlyph(option.value)
        return { id: option.value, label: optionLabel(option), ...icon === undefined ? {} : { icon } }
      })

    const menuAnchor = h(
      'button',
      {
        type: 'button',
        class: css.trigger ?? '',
        'aria-label': t('input.accessMode', { name: current === undefined ? displayName(currentValue) : optionLabel(current) }),
        title: current?.description,
        disabled: locked || busy,
        onclick: () => { this.#open = !this.#open; this.#render() },
      },
      permissionGlyph(currentValue) !== undefined && (
        h('span', { class: css.triggerIcon ?? '', 'aria-hidden': true }, permissionGlyph(currentValue))
      ),
      h('span', { class: css.triggerLabel ?? '' }, current === undefined ? displayName(currentValue) : optionLabel(current)),
      // Same glyph + open rotation as the sibling ModelSelect trigger.
      h('span', { class: clsx(css.chevron, open && css.chevronOpen), 'aria-hidden': true },
        h(IconChevronDownOutline14, null)),
    )

    this.#menu = renderMenu(this.#menu, {
      open,
      items,
      selectedId: currentValue,
      onSelect: (id) => { this.#choose(id) },
      onClose: () => { this.#open = false; this.#render() },
      side: 'top',
      anchor: menuAnchor,
    })
    const menu = this.#menu

    this.#confirmModal = renderRiskConfirmation(this.#confirmModal, {
      open: confirmation !== null,
      title: t('access.confirm.title'),
      description: t('access.confirm.description'),
      acknowledgeLabel: t('access.confirm.acknowledge'),
      cancelLabel: t('access.confirm.cancel'),
      confirmLabel: t('access.confirm.enable'),
      acknowledged,
      disabled: locked,
      onAcknowledgedChange: (next) => { this.#acknowledged = next; this.#render() },
      onCancel: () => { this.#closeConfirmation() },
      onConfirm: () => { this.#confirmFullAccess() },
    })

    const vdom = h('span', null, menu)
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-permission-select') === undefined) {
  customElements.define('freddie-permission-select', FreddiePermissionSelect)
}

/**
 * Update (or create) the underlying `freddie-permission-select` in place.
 * @param el - an existing element (from a prior call) to update, or null to create one.
 * @param props - see {@link PermissionSelectProps}.
 * @returns the `freddie-permission-select` element; hold it and pass it back in on the next render.
 */
export function renderPermissionSelect(el, props) {
  const target = el ?? document.createElement('freddie-permission-select')
  target.setProps(props)
  return target
}

/**
 * One-shot creation/update helper preserving the original function-component
 * call shape for a caller that has not yet been converted to hold the
 * element itself. Prefer `renderPermissionSelect(el, props)` in any owner
 * that re-renders more than once (holds the element across renders instead
 * of recreating it every call — recreating it orphans its own internally
 * held `#menu`/`#confirmModal` `freddie-menu`/`freddie-modal` elements onto
 * `document.body` on every owner re-render, since the replaced
 * `freddie-permission-select` node is torn down but never signals those
 * self-mounted children to remove themselves).
 */
export function PermissionSelect(props) {
  return renderPermissionSelect(null, props)
}
