// Shared IconActions chrome for user and assistant messages: copy
// live, optional branch wiring, and an optional date-aware clock.
//
// Converted from a React hooks component to a webjsx custom element:
// copied/copyPending/copyTimer/copyEpoch useState/useRef become private
// fields, useId becomes a per-instance generated id, useCallback/useEffect
// become plain methods plus connectedCallback/disconnectedCallback, and
// re-render is an explicit applyDiff(this, vdom) call.

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import {
  IconBranchOutline16, IconCheckOutline16, IconCopyOutline16, renderTooltip, writeClipboard,
} from '@freddie/freddie-client-ui-primitives'
import { formatLatencySeconds, formatMessageClock, formatRunDuration, formatTokensPerSecond } from './message-chrome.js'
import { createCalendarDay } from './use-calendar-day.js'
import css from './MessageIconActions.css.js'

const DEFAULT_PROPS = { text: '', clock: 'start', t: (key) => key }

let nextReasonId = 0

/**
 * Copy / branch (/ clock) IconActions row shared by user and assistant chrome.
 */
export class FreddieMessageIconActions extends HTMLElement {
  #props = DEFAULT_PROPS
  #reasonId = `message-icon-actions-branch-reason-${(nextReasonId += 1)}`
  // Same success chrome as CodeBlock: a short check swap after the write,
  // gated so re-clicks during the window neither re-copy nor stack timers.
  #copied = false
  #copyPending = false
  #copyTimer = null
  #copyEpoch = 0
  #day = createCalendarDay(() => { this.#render() })
  #copyTooltipEl = null
  #branchTooltipEl = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#copyEpoch += 1
    this.#copyPending = false
    if (this.#copyTimer !== null) clearTimeout(this.#copyTimer)
    this.#day.stop()
  }

  #onCopy = () => {
    if (this.#copied || this.#copyPending) return
    const epoch = this.#copyEpoch
    this.#copyPending = true
    void writeClipboard(this.#props.text).then((ok) => {
      if (epoch !== this.#copyEpoch) return
      this.#copyPending = false
      if (!ok) return
      this.#copied = true
      this.#render()
      this.#copyTimer = window.setTimeout(() => {
        this.#copyTimer = null
        this.#copied = false
        this.#render()
      }, 1000)
    })
  }

  #render() {
    const {
      text: _text, time, runMs, ttftMs, tokensPerSecond, clock, onBranch, branchUnavailable = false, className,
      extraActions, t,
    } = this.#props
    const copied = this.#copied
    const day = this.#day.day
    // The dot is decorative and stays hidden, but its margins separate the
    // readings only on screen: without the flanking spaces a reader hears one
    // run-on string ("Ran for 13sTTFT 0.2s12 tok/s") instead of three facts.
    const clockEl = time === undefined ? null : (
      h('span', { class: (clock === 'start' ? css.timeStart : css.timeEnd) ?? '' },
        formatMessageClock(time, t, day),
        runMs !== undefined && (
          h(Fragment, null,
            ' ',
            h('span', { class: css.runTimeDot ?? '', 'aria-hidden': true }, '·'),
            ' ',
            t('message.ranFor', { duration: formatRunDuration(runMs, t) }),
          )
        ),
        ttftMs !== undefined && (
          h(Fragment, null,
            ' ',
            h('span', { class: css.runTimeDot ?? '', 'aria-hidden': true }, '·'),
            ' ',
            t('message.ttft', { seconds: formatLatencySeconds(ttftMs) }),
          )
        ),
        tokensPerSecond !== undefined && (
          h(Fragment, null,
            ' ',
            h('span', { class: css.runTimeDot ?? '', 'aria-hidden': true }, '·'),
            ' ',
            t('message.tokensPerSecond', { tps: formatTokensPerSecond(tokensPerSecond) }),
          )
        ),
      )
    )
    // h(Tooltip, {...}) calls Tooltip(props) synchronously (webjsx's
    // function-component branch), Tooltip.js's bare one-shot factory --
    // recreating the freddie-tooltip element (dropping its in-flight #showTimer
    // hover-delay) on every #render(), which this element itself does on
    // every copy/branch/clock state change. renderTooltip(cached, props)
    // reuses the same element instead.
    this.#copyTooltipEl = renderTooltip(this.#copyTooltipEl, {
      label: copied ? t('copied') : t('copy'), side: 'bottom',
      children: [
        h('button', { type: 'button', class: css.action ?? '', 'aria-label': copied ? t('copied') : t('copy'), onclick: this.#onCopy },
          copied ? h(IconCheckOutline16, null) : h(IconCopyOutline16, null),
        ),
      ],
    })
    if (onBranch !== undefined) {
      this.#branchTooltipEl = renderTooltip(this.#branchTooltipEl, {
        label: branchUnavailable ? t('message.branchUnavailable') : t('message.branch'), side: 'bottom',
        children: [
          // Native disabled buttons do not deliver the hover/focus events Tooltip needs.
          h('button',
            {
              type: 'button',
              class: css.action ?? '',
              'aria-label': t('message.branch'),
              'aria-disabled': branchUnavailable || undefined,
              'aria-describedby': branchUnavailable ? this.#reasonId : undefined,
              'data-unavailable': branchUnavailable || undefined,
              onclick: branchUnavailable ? null : onBranch,
            },
            h(IconBranchOutline16, null),
          ),
        ],
      })
    } else {
      this.#branchTooltipEl = null
    }
    const vdom = (
      h('div', { class: className === undefined ? css.actions ?? '' : `${css.actions ?? ''} ${className}` },
        clock === 'start' ? clockEl : null,
        this.#copyTooltipEl,
        extraActions,
        onBranch !== undefined && this.#branchTooltipEl,
        onBranch !== undefined && branchUnavailable && (
          h('span', { id: this.#reasonId, class: css.visuallyHidden ?? '' }, t('message.branchUnavailable'))
        ),
        clock === 'end' ? clockEl : null,
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-message-icon-actions') === undefined) {
  customElements.define('freddie-message-icon-actions', FreddieMessageIconActions)
}

/**
 * Create (if needed) or update a MessageIconActions element in place.
 * @param el - an existing `freddie-message-icon-actions` element to update, or null to create one.
 * @param props - see {@link MessageIconActionsProps}.
 * @returns the `freddie-message-icon-actions` element; keep it and pass it back in to update.
 */
export function renderMessageIconActions(el, props) {
  const target = el ?? document.createElement('freddie-message-icon-actions')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function MessageIconActions(props) {
  return renderMessageIconActions(null, props)
}
