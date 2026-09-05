import { applyDiff, createElement as h } from 'webjsx'
import { IconCloseFill14 } from '@freddie/freddie-client-ui-primitives'
import css from './PlanModeControl.css.js'

/**
 * Plan-mode status over the host-computed `plan` projection. The chip renders
 * only while the effective target is plan mode (`pending ? !active : active`
 * — a folded host value, not client optimism) and executes /plan off.
 *
 * Converted from a React hooks component to a webjsx custom element:
 * leaving/error state become instance fields, the alive-tracking useEffect
 * becomes connectedCallback/disconnectedCallback, and re-render is an
 * explicit applyDiff(this, vdom) call (Toast.tsx's pattern).
 */
export class FreddiePlanChip extends HTMLElement {
  #props = null
  #leaving = false
  #error = null
  #alive = true

  /** Set/replace props and re-render; call after creating or updating the element. */
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
    // No leaving/locked guard: both disable the button, so no click arrives.
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
          // Design literal, not copy: the chip wordmark stays 'Plan' in every locale.
          'Plan',
          h('span', {class: css.close ?? '', 'aria-hidden': ''},
            h(IconCloseFill14, {size: 12}),
          ),
        ),
        // Failure copy stays English (error-surface policy: not localized).
        this.#error !== null && h('span', {class: css.error ?? '', role: 'status', title: this.#error}, 'failed to exit plan mode'),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-plan-chip') === undefined) {
  customElements.define('freddie-plan-chip', FreddiePlanChip)
}

/** One-shot creation helper preserving the original function-component call shape. */
export function PlanChip(props) {
  const el = document.createElement('freddie-plan-chip')
  el.setProps(props)
  return el
}
