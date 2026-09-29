import { applyDiff, createElement as h } from '@freddie/webjsx'
import { IconCloseFill14, defineElement } from '@freddie/freddie-client-ui-primitives'
import css from './PlanModeControl.css.js'

export class FreddiePlanChip extends HTMLElement {
  #props = null
  #leaving = false
  #error = null
  #alive = true

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#alive = true
    this.#render()
  }

  disconnectedCallback() {
    this.#alive = false
  }

  #off() {
    const props = this.#props
    if (props === null) return
    const { exitPlanMode } = props
    this.#leaving = true
    this.#error = null
    this.#render()
    void exitPlanMode().then((failure) => {
      if (!this.#alive) return
      this.#leaving = false
      this.#error = failure
      this.#render()
    }, (reason) => {
      if (!this.#alive) return
      this.#leaving = false
      this.#error = reason instanceof Error ? reason.message : String(reason)
      this.#render()
    })
  }

  #render() {
    const props = this.#props
    if (props === null) { applyDiff(this, []); return }
    const { useProjection, locked, t } = props
    const plan = useProjection('plan')
    if (plan === undefined) { applyDiff(this, []); return }
    const target = plan.pending ? !plan.active : plan.active
    if (!target) { applyDiff(this, []); return }

    const vdom = (
      h('span', {class: css.wrap ?? ''},
        h('button', {
          type: 'button',
          class: css.chip ?? '',
          'aria-label': t('chip.on.aria'),
          title: t('chip.on.title'),
          disabled: locked || this.#leaving,
          onclick: () => { this.#off() },
        },
          'Plan',
          h('span', {class: css.close ?? '', 'aria-hidden': ''},
            h(IconCloseFill14, {size: 12}),
          ),
        ),
        this.#error !== null && h('span', {class: css.error ?? '', role: 'status', title: this.#error}, 'failed to exit plan mode'),
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-plan-chip', FreddiePlanChip)

export function PlanChip(props) {
  const el = document.createElement('freddie-plan-chip')
  el.setProps(props)
  return el
}
