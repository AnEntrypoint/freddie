import { applyDiff, createElement as h } from '@freddie/webjsx'
import css from './OnboardingSurface.css.js'
import { defineElement } from './define-element.js'

/**
 * Onboarding takeover chrome (mask + opaque stage) around one step's content,
 * as a custom element that keeps the application root inert while mounted.
 * Attaches itself to `document.body` on connect.
 */
export class FreddieOnboardingSurface extends HTMLElement {
  #props = {}

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    const appRoot = document.getElementById('root')
    if (appRoot !== null) appRoot.inert = true
    this.#render()
  }

  disconnectedCallback() {
    const appRoot = document.getElementById('root')
    if (appRoot !== null) appRoot.inert = false
  }

  #render() {
    const { children } = this.#props
    const vdom = h(
      'div',
      { class: css.onboardingOverlay ?? '', role: 'presentation' },
      h('div', { class: css.onboardingMask ?? '', 'aria-hidden': 'true' }),
      h('div', { class: css.onboardingStage ?? '' }, children),
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-onboarding-surface', FreddieOnboardingSurface)

/**
 * Create and mount an OnboardingSurface onto `document.body`.
 * @param props.children - the step's page content, centered on the stage.
 * @returns the mounted `freddie-onboarding-surface` element; call `.remove()` when the step unmounts.
 */
export function OnboardingSurface(props) {
  const el = document.createElement('freddie-onboarding-surface')
  document.body.appendChild(el)
  el.setProps(props)
  return el
}
