// Modal: controlled full-viewport dialog (create-workspace and similar).
// The overlay portals to this document's body so ancestor stacking contexts
// cannot leave sticky page controls above the mask. This is still an in-page
// WebUI dialog; it never creates or targets another browser/native window.
//
// Converted from a React hooks component to a webjsx custom element: the
// Escape-key listener that was useEffect becomes connectedCallback/
// disconnectedCallback, and re-render is an explicit applyDiff(this, vdom)
// call (Toast.tsx's pattern) instead of implicit re-render on state change.

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import clsx from 'clsx'
import { IconCloseOutline16 } from './icons/index.js'
import css from './Modal.css.js'

/**
 * Centered modal over a blurred page mask, as a custom element. Attaches
 * itself to `document.body` on connect (mirrors Toast's mount pattern) so an
 * owner inside a transformed or filtered ancestor cannot trap the fixed
 * overlay in that ancestor's box.
 */
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), '
  + 'select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export class FreddieModal extends HTMLElement {
  #props = { open: false, onClose: () => {}, title: '' }
  #wasOpen = false
  #returnFocusTo = null

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    document.addEventListener('keydown', this.#onKeyDown)
    this.#render()
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.#onKeyDown)
    // A caller that removes this element directly while it was open (rather
    // than setProps({open: false}) first, e.g. a shared-singleton cache
    // torn down on completion) would otherwise skip #syncFocus(false)
    // entirely, since it only runs from #render()'s own !open branch --
    // silently dropping the focus-restoration this class exists to provide.
    this.#syncFocus(false)
  }

  #onKeyDown = (e) => {
    if (!this.#props.open) return
    if (e.key === 'Escape') { this.#props.onClose(); return }
    if (e.key === 'Tab') this.#trapTab(e)
  }

  // aria-modal="true" declares this dialog traps focus; without this, Tab
  // silently escapes to the page behind the mask. Queried live rather than
  // cached, since the dialog's focusable set can change across renders
  // (a footer button appearing, a field becoming enabled).
  #trapTab(e) {
    const dialog = this.querySelector('[role="dialog"]')
    if (dialog === null) return
    const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
    if (focusable.length === 0) {
      // A transient all-disabled state (every footer action shares one
      // busy flag) leaves nothing #syncFocus's own first-element target
      // could have landed on either -- keep Tab from escaping the mask by
      // redirecting into the dialog container itself, the same fallback
      // #syncFocus already uses for initial focus.
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault()
        dialog.focus()
      }
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first || !dialog.contains(document.activeElement)) {
        e.preventDefault()
        last.focus()
      }
    } else if (document.activeElement === last || !dialog.contains(document.activeElement)) {
      e.preventDefault()
      first.focus()
    }
  }

  // Initial focus on open (the WAI-ARIA dialog pattern's own recommendation:
  // the first focusable element, or the dialog itself as a fallback), and
  // focus restoration to whatever had it before the dialog opened -- both
  // one-shot transitions, not a per-render effect, so they never fight a
  // user's own subsequent focus change while the dialog stays open.
  #syncFocus(open) {
    if (open === this.#wasOpen) return
    this.#wasOpen = open
    if (open) {
      this.#returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const dialog = this.querySelector('[role="dialog"]')
      const target = dialog?.querySelector(FOCUSABLE_SELECTOR) ?? dialog
      target?.focus()
    } else {
      this.#returnFocusTo?.focus()
      this.#returnFocusTo = null
    }
  }

  #render() {
    const {
      open, onClose, title, closeLabel = 'Close', description, children, footer,
      className, contentClassName, headless = false,
    } = this.#props

    if (!open) {
      applyDiff(this, h('span', { style: 'display:none' }))
      this.#syncFocus(false)
      return
    }

    const vdom = h(
      'div',
      { class: css.root ?? '', role: 'presentation' },
      h('div', { class: css.mask ?? '', 'aria-hidden': 'true', onclick: onClose }),
      h(
        'div',
        {
          class: clsx(css.dialog, className),
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': title,
          // Programmatically focusable (not in the Tab order) so #syncFocus
          // and #trapTab's own fallback -- there being no focusable child at
          // all -- can actually land focus somewhere inside the dialog
          // instead of .focus() silently no-op'ing on a plain <div>.
          tabindex: '-1',
        },
        headless
          ? children
          : (
            h(
              Fragment,
              null,
              h(
                'div',
                { class: clsx(css.content, contentClassName) },
                h(
                  'div',
                  { class: css.header ?? '' },
                  h('h2', { class: css.title ?? '' }, title),
                  h(
                    'button',
                    { type: 'button', class: css.close ?? '', 'aria-label': closeLabel, onclick: onClose },
                    h(IconCloseOutline16, { size: 14 }),
                  ),
                ),
                description !== undefined && description !== '' && (
                  h('p', { class: css.description ?? '' }, description)
                ),
                children !== undefined && children !== null && h('div', { class: css.body ?? '' }, children),
              ),
              footer !== undefined && footer !== null && h('div', { class: css.footer ?? '' }, footer),
            )
          ),
      ),
    )
    applyDiff(this, vdom)
    this.#syncFocus(true)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-modal') === undefined) {
  customElements.define('freddie-modal', FreddieModal)
}

/**
 * Create (if needed) and update a Modal mounted on `document.body`.
 * @param el - an existing mounted modal (from a prior call), or null to create one.
 * @param props - see {@link ModalProps}.
 * @returns the mounted `freddie-modal` element; keep it and pass it back in to update, `.remove()` when done with it.
 */
export function renderModal(el, props) {
  const target = el ?? (() => {
    const created = document.createElement('freddie-modal')
    document.body.appendChild(created)
    return created
  })()
  target.setProps(props)
  return target
}

/**
 * Convenience wrapper preserving the original function-component call shape
 * for simple one-shot usage: creates the element, sets props, and returns it.
 * Callers that need to update props across renders should hold the returned
 * element and call `.setProps()` directly.
 *
 * The `FreddieModal` return self-mounts to `document.body` (see the class doc
 * above), so it is never diffed as a child of the caller's own vdom — the
 * call site only needs the side effect.
 */
export function Modal(props) {
  return renderModal(null, props)
}
