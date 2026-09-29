/**
 * Shared modal chrome for every step registered by this onboarding plugin.
 *
 * Converted from a React hooks component: the root-inert toggle and
 * title-focus effects were `useEffect`s tied to mount/unmount and prop
 * changes. This component always renders open (never toggled by a `open`
 * prop), so the effects collapse to plain imperative calls made once, here,
 * each time the step calls this function to build its VNode — matching the
 * lifetime of the returned `Modal` element.
 */

import { createElement as h } from '@freddie/webjsx'
import { renderModal } from '@freddie/freddie-client-ui-primitives'
import css from './OnboardingModal.css.js'

const ignoreImplicitDismiss = () => {}

let cachedModalEl = null

/**
 * Render a blocking onboarding dialog and keep the application root inert
 * for as long as the step keeps rendering this modal.
 * @param props.title - accessible and visible dialog title.
 * @param props.focusTitle - focus the title when the step has no form control.
 * @param props.children - step-owned body and actions.
 * @returns null because the modal remains portaled to document.body.
 */
export function OnboardingModal({
  title, focusTitle = false, children,
}) {
  const appRoot = document.getElementById('root')
  if (appRoot !== null && !appRoot.inert) appRoot.inert = true

  const bindTitle = (el) => {
    if (el !== null && focusTitle) el.focus()
  }

  cachedModalEl = renderModal(cachedModalEl, {
    open: true,
    title,
    onClose: ignoreImplicitDismiss,
    headless: true,
    className: css.dialog,
    children: [
      h('div', { class: css.content ?? '' },
        h('h2', { ref: bindTitle, class: css.title ?? '', tabindex: focusTitle ? -1 : undefined }, title),
        h('div', { class: css.body ?? '' }, children),
      ),
    ],
  })
  return null
}

/**
 * Release the resources OnboardingModal claimed: un-inert the application
 * root and remove the cached freddie-modal element. Neither is reachable from
 * inside OnboardingModal itself -- it is a plain function with no unmount
 * signal of its own, called every render while a step is active and simply
 * not called once that step stops rendering it. The onboarding host renders
 * at most one step at a time (SettingsRoot's own onboardingSteps.find, not
 * .filter), so each step's own null-returning branch owns calling this the
 * moment it stops needing the shared modal -- idempotent, so calling it from
 * a branch that never actually showed the modal is harmless.
 */
export function closeOnboardingModal() {
  const appRoot = document.getElementById('root')
  if (appRoot !== null) appRoot.inert = false
  cachedModalEl?.remove()
  cachedModalEl = null
}
