import { applyDiff, createElement as h } from '@freddie/webjsx'
import { Button, IconEditOutline16, renderMarkdownText, defineElement } from '@freddie/freddie-client-ui-primitives'
import css from './PlanReviewPanel.css.js'

function tooltip(description) {
  return description === undefined ? {} : { title: description }
}

export class FreddiePlanReviewPanel extends HTMLElement {
  #props = null
  #busy = false
  #error = null
  #planEl = null

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

defineElement('freddie-plan-review-panel', FreddiePlanReviewPanel)
