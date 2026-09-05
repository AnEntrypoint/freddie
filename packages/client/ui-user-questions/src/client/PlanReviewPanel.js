// PlanReviewPanel: the composer takeover for a question carrying the
// `plan-review` presentation intent. A plan under review is one decision over
// one body of markdown, so it takes the waiting-approval card shape — tinted
// strip, content, right-aligned action row — instead of the generic question
// flow's pager, numbered options, skip and custom-answer affordances, which
// read as a quiz the user is being graded on.
//
// The three actions are the whole decision surface: approve and decline answer
// the question with the option labels the asker offered (localised copy on the
// buttons, the asker's descriptions as their tooltips), while "discuss"
// dismisses the request so the composer returns and the user can simply say
// what they want. Dismissal is the generic flow's own cancel verb, promoted to
// a labelled button because in a two-outcome decision it is the third real
// answer, not an escape hatch.
//
// Converted from a React hooks component to a webjsx custom element: `busy`
// and `error` become instance fields, and re-render is an explicit
// applyDiff(this, vdom) call instead of implicit re-render on setState.

import { applyDiff, createElement as h } from 'webjsx'
import { Button, IconEditOutline16, renderMarkdownText } from '@freddie/freddie-client-ui-primitives'
import css from './PlanReviewPanel.css.js'

/**
 * Optional-prop spread for a decision button's tooltip: `title` is optional on
 * the DOM props, and exactOptionalPropertyTypes rejects an explicit undefined.
 *
 * @param description - the asker's option description, when it carries one.
 * @returns The `title` prop to spread, or nothing.
 */
function tooltip(description) {
  return description === undefined ? {} : { title: description }
}

/**
 * Plan-review decision card custom element: approve/decline/discuss over one
 * plan under review. One-shot latch shaped like the approval takeover's: the
 * panel leaves only when the host's resolved frame lands, so until then a
 * second click must not re-fire. A failed send (rejected receipt / transport)
 * re-arms it and shows why, since nothing else would tell the user the click
 * was lost.
 */
export class FreddiePlanReviewPanel extends HTMLElement {
  #props = null
  #busy = false
  #error = null
  #planEl = null

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #settle(send) {
    this.#busy = true
    this.#error = null
    this.#render()
    void send().catch((cause) => {
      this.#busy = false
      this.#error = cause instanceof Error ? cause.message : String(cause)
      this.#render()
    })
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { pending, review, t } = props
    const decide = (label) => {
      this.#settle(() => pending.answer({ answers: [{ id: review.id, selected: [label] }] }))
    }
    const decline = review.decline
    const busy = this.#busy
    const error = this.#error

    const vdom = (
      h('div', {class: css.frame ?? '', 'data-plan-review-key': pending.key},
        h('section', {class: css.card ?? '', 'aria-label': review.question},
          h('div', {class: css.strip ?? ''},
            h('span', {class: css.dot ?? ''}),
            t('plan.header'),
          ),
          h('div', {class: css.body ?? '', 'data-plan-review-scroll': ''},
            (this.#planEl = renderMarkdownText(this.#planEl, {text: review.plan})),
          ),
          h('div', {class: css.footer ?? ''},
            h('div', {class: css.feedback ?? '', role: 'status'}, error),
            h('div', {class: css.actions ?? ''},
              h(Button,
                {
                  variant: 'ghost', class: css.discuss ?? '', icon: h(IconEditOutline16, {size: 14}),
                  disabled: busy, onclick: () => { this.#settle(() => pending.cancel()) },
                },
                t('plan.discuss'),
              ),
              decline !== undefined && h(Button,
                {
                  variant: 'outline', ...tooltip(decline.description),
                  disabled: busy, onclick: () => { decide(decline.label) },
                },
                t('plan.decline'),
              ),
              h(Button,
                {
                  variant: 'primary', ...tooltip(review.approve.description),
                  disabled: busy, onclick: () => { decide(review.approve.label) },
                },
                t('plan.approve'),
              ),
            ),
          ),
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-plan-review-panel') === undefined) {
  customElements.define('freddie-plan-review-panel', FreddiePlanReviewPanel)
}
