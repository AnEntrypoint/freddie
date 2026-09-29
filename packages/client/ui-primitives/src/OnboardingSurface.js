import { applyDiff, createElement as h } from '@freddie/webjsx'
import css from './OnboardingSurface.css.js'
import { defineElement } from './define-element.js'

export class FreddieOnboardingSurface extends HTMLElement {
  #props = {}

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

export function OnboardingSurface(props) {
  const el = document.createElement('freddie-onboarding-surface')
  document.body.appendChild(el)
  el.setProps(props)
  return el
}
