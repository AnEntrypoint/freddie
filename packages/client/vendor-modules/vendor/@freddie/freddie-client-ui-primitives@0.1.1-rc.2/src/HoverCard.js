// HoverCard: delayed hover-preview card portaled to document.body.
// Same portal mechanics as Menu: the wrapper span supplies the anchor rect,
// the card is fixed-positioned at its right edge and repositions on
// scroll/resize while open. The card is reachable: it takes pointer events,
// and leaving the anchor only arms a grace-delayed close, so the pointer can
// cross the 8px gap and settle on the card to read a clipped path or title.
//
// Converted from a React hooks component to a webjsx custom element: open/
// pos/copied state become instance fields, the placement/grace/copy effects
// become connectedCallback/disconnectedCallback plus explicit timers, and
// re-render is an explicit applyDiff(this, vdom) call (Toast.tsx's pattern).
// The card is appended to document.body directly (createPortal's webjsx
// equivalent) rather than being a DOM child of the wrapper, so its pointer
// events are wired independently instead of riding React's enter/leave
// tree traversal.

import { applyDiff, createElement as h } from 'webjsx'
import { writeClipboard } from './clipboard.js'
import css from './HoverCard.css.js'

const DEFAULT_PROPS = { anchor: '', content: '' }

/** Anchor-with-hover-triggered-preview-card custom element. */
export class DshHoverCard extends HTMLElement {
  #props = DEFAULT_PROPS
  #open = false
  #pos = null
  #copied = false
  #openTimer = null
  #closeTimer = null
  #copyTimer = null
  #copyHeight = null
  #copyEpoch = 0
  #copying = false
  #placeHandler = null
  #card = null

  setProps(props) {
    const wasDisabled = this.#props.disabled === true
    this.#props = props
    if (props.disabled === true && !wasDisabled) this.#close()
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#copyEpoch += 1
    this.#clearOpenTimer()
    this.#clearCloseTimer()
    this.#clearCopyTimer()
    this.#unbindPlacement()
    this.#card?.remove()
    this.#card = null
  }

  #clearOpenTimer() {
    if (this.#openTimer !== null) { clearTimeout(this.#openTimer); this.#openTimer = null }
  }

  #clearCloseTimer() {
    if (this.#closeTimer !== null) { clearTimeout(this.#closeTimer); this.#closeTimer = null }
  }

  #clearCopyTimer() {
    if (this.#copyTimer !== null) { clearTimeout(this.#copyTimer); this.#copyTimer = null }
  }

  #clearCopied() {
    this.#clearCopyTimer()
    this.#copyHeight = null
    this.#copied = false
  }

  #close() {
    this.#copyEpoch += 1
    this.#clearCopied()
    this.#open = false
    this.#unbindPlacement()
    this.#render()
  }

  #armClose() {
    this.#clearCloseTimer()
    this.#closeTimer = setTimeout(() => {
      this.#closeTimer = null
      this.#close()
    }, 200)
  }

  #cancelClose() {
    this.#clearCloseTimer()
  }

  #bindPlacement() {
    this.#unbindPlacement()
    const place = () => {
      const wrapper = this.querySelector('[data-hovercard-root]')
      if (wrapper === null) return
      const r = wrapper.getBoundingClientRect()
      const h = this.#card?.offsetHeight ?? 0
      const top = r.top + h > window.innerHeight - 8 ? window.innerHeight - h - 8 : r.top
      this.#pos = { left: r.right + 8, top }
      this.#render()
    }
    this.#placeHandler = place
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
  }

  #unbindPlacement() {
    if (this.#placeHandler === null) { this.#pos = null; return }
    window.removeEventListener('scroll', this.#placeHandler, true)
    window.removeEventListener('resize', this.#placeHandler)
    this.#placeHandler = null
    this.#pos = null
  }

  async #copy(text) {
    if (this.#copied || this.#copying) return
    this.#copying = true
    const epoch = this.#copyEpoch
    const accepted = await writeClipboard(text)
    this.#copying = false
    if (!accepted || epoch !== this.#copyEpoch || this.#card === null) return
    const height = this.#card.offsetHeight
    this.#copyHeight = height > 0 ? height : null
    this.#copied = true
    this.#render()
    this.#copyTimer = setTimeout(() => {
      this.#copyTimer = null
      this.#clearCopied()
      this.#render()
    }, 1000)
  }

  #render() {
    const { anchor, content, openDelayMs = 500, disabled = false, copyText, copyLabel = 'Copy', copiedLabel = 'Copied' } = this.#props
    const copyable = copyText !== undefined
    const showCard = this.#open && this.#pos !== null

    if (!showCard) {
      this.#card?.remove()
      this.#card = null
    }

    const pos = this.#pos
    const cardVNode = showCard && pos !== null
      ? h(
        'div',
        {
          class: `${css.card}${copyable ? ` ${css.copyable}` : ''}${this.#copied ? ` ${css.feedback}` : ''}`,
          style: `left: ${pos.left}px; top: ${pos.top}px;${this.#copied && this.#copyHeight !== null ? ` min-height: ${this.#copyHeight}px;` : ''}`,
          role: copyable ? 'button' : null,
          tabindex: copyable ? 0 : undefined,
          'aria-label': copyable ? `${copyLabel}: ${copyText}` : undefined,
          onclick: copyable
            ? (e) => {
              const selection = window.getSelection()
              if (selection !== null && !selection.isCollapsed) {
                for (let i = 0; i < selection.rangeCount; i += 1) {
                  if (selection.getRangeAt(i).intersectsNode(e.currentTarget)) return
                }
              }
              void this.#copy(copyText)
            }
            : null,
          onkeydown: copyable
            ? (e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              void this.#copy(copyText)
            }
            : null,
        },
        this.#copied ? h('span', { class: css.copied ?? '', 'aria-hidden': 'true' }, copiedLabel) : content,
      )
      : null

    if (cardVNode !== null) {
      if (this.#card === null) {
        this.#card = document.createElement('div')
        document.body.appendChild(this.#card)
      }
      applyDiff(this.#card, cardVNode)
    }

    const vdom = h(
      'span',
      {
        'data-hovercard-root': '',
        class: css.root ?? '',
        onpointerenter: () => {
          if (disabled) return
          this.#cancelClose()
          if (this.#open) return
          this.#clearOpenTimer()
          this.#openTimer = setTimeout(() => {
            this.#openTimer = null
            this.#open = true
            this.#bindPlacement()
            this.#render()
          }, openDelayMs)
        },
        onpointerleave: () => {
          this.#clearOpenTimer()
          if (this.#open) this.#armClose()
        },
        onpointerdowncapture: (e) => {
          if (this.#card?.contains(e.target) === true) return
          this.#clearOpenTimer()
          this.#cancelClose()
          this.#close()
        },
      },
      anchor,
      this.#open && copyable && h('span', { class: css.status ?? '', role: 'status' }, this.#copied ? copiedLabel : ''),
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('dsh-hover-card') === undefined) {
  customElements.define('dsh-hover-card', DshHoverCard)
}

/**
 * Create (if needed) or update a HoverCard element in place.
 * @param el - an existing `dsh-hover-card` element to update, or null to create one.
 * @param props - see {@link HoverCardProps}.
 * @returns the `dsh-hover-card` element; keep it and pass it back in to update.
 */
export function renderHoverCard(el, props) {
  const target = el ?? document.createElement('dsh-hover-card')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function HoverCard(props) {
  return renderHoverCard(null, props)
}
