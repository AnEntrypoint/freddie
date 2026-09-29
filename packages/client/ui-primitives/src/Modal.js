import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import clsx from 'clsx'
import { IconCloseOutline16 } from './icons/index.js'
import css from './Modal.css.js'
import { defineElement } from './define-element.js'
import { isTopmostModal } from './modal-stack.js'

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), '
  + 'select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export class FreddieModal extends HTMLElement {
  #props = { open: false, onClose: () => {}, title: '' }
  #wasOpen = false
  #returnFocusTo = null

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


export function renderModal(el, props) {
  const target = el ?? (() => {
    const created = document.createElement('freddie-modal')
    document.body.appendChild(created)
    return created
  })()
  target.setProps(props)
  return target
}

export function Modal(props) {
  return renderModal(null, props)
}
