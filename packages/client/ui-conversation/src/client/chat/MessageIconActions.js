import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import {
  IconBranchOutline16, IconCheckOutline16, IconCopyOutline16, renderTooltip, writeClipboard,
  defineElement,
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

defineElement('freddie-message-icon-actions', FreddieMessageIconActions)

/**
 * @typedef {object} MessageIconActionsProps
 * @property {string} text - clipboard text for the copy action.
 * @property {number} [time] - message timestamp shown next to the actions; omitted hides the clock.
 * @property {number} [runMs] - total run duration to append to the clock, in milliseconds.
 * @property {number} [ttftMs] - time-to-first-token to append to the clock, in milliseconds.
 * @property {number} [tokensPerSecond] - decode throughput to append to the clock.
 * @property {'start'|'end'} clock - which side of the row shows the clock.
 * @property {() => void} [onBranch] - branch handler; omitted hides the branch action entirely.
 * @property {boolean} [branchUnavailable] - disables the branch action and shows the unavailable reason.
 * @property {string} [className] - extra class appended to the row.
 * @property {*} [extraActions] - additional action elements rendered between copy and branch.
 * @property {(key: string, vars?: object) => string} t - localization function.
 */

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
