import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import clsx from 'clsx'
import { IconCloseOutline16 } from './icons/index.js'
import css from './Modal.css.js'
import { defineElement } from './define-element.js'
import { isTopmostModal } from './modal-stack.js'

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
    this.#syncFocus(false)
  }

  #onKeyDown = (e) => {
    if (!this.#props.open) return
    if (!isTopmostModal(this.querySelector('[role="dialog"]'))) return
    if (e.key === 'Escape') { this.#props.onClose(); return }
    if (e.key === 'Tab') this.#trapTab(e)
  }

  #trapTab(e) {
    const dialog = this.querySelector('[role="dialog"]')
    if (dialog === null) return
    const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
    if (focusable.length === 0) {
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

defineElement('freddie-modal', FreddieModal)

/**
 * @typedef {object} ModalProps
 * @property {boolean} [open=false] - whether the dialog is visible.
 * @property {function(): void} [onClose=() => {}] - called on mask click, close button, or Escape.
 * @property {string} [title=''] - dialog heading; also used as the dialog's `aria-label`.
 * @property {string} [closeLabel='Close'] - accessible label for the close button.
 * @property {string} [description] - optional supporting text rendered under the header.
 * @property {*} [children] - dialog body content, skipped when `headless` is true (the caller then owns everything under `[role="dialog"]`).
 * @property {*} [footer] - optional content rendered below the body.
 * @property {string} [className] - class added to the dialog element itself.
 * @property {string} [contentClassName] - class added to the wrapper around header/description/body.
 * @property {boolean} [headless=false] - when true, render `children` directly with no header/description/body chrome.
 */

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
